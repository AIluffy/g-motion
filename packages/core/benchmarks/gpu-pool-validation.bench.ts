import { describe, bench, expect, beforeAll } from 'vitest';
import { StagingBufferPool } from '../src/webgpu/staging-pool';
import { AsyncReadbackManager } from '../src/webgpu/async-readback';

/**
 * Phase 3 Validation: Staging Buffer Pool & Async Readback
 *
 * Tests:
 * 1. Pool stability over 1000+ frames with multiple archetypes
 * 2. Buffer reuse efficiency (no excessive allocation)
 * 3. LRU reclamation behavior
 * 4. Memory leak detection
 * 5. Concurrent readback management
 */

// Mock GPUDevice with minimal implementation
class MockGPUDevice {
  private bufferCounter = 0;

  createBuffer(descriptor: any): MockGPUBuffer {
    return new MockGPUBuffer(this.bufferCounter++, descriptor.size, descriptor.label);
  }
}

class MockGPUBuffer {
  id: number;
  size: number;
  label: string;
  destroyed = false;
  mapped = false;
  data: Float32Array;

  constructor(id: number, size: number, label: string) {
    this.id = id;
    this.size = size;
    this.label = label;
    this.data = new Float32Array(size / 4);
  }

  async mapAsync(_mode: number): Promise<void> {
    if (this.destroyed) throw new Error('Buffer destroyed');
    this.mapped = true;
    return Promise.resolve();
  }

  getMappedRange(): ArrayBuffer {
    if (!this.mapped) throw new Error('Buffer not mapped');
    return this.data.buffer as ArrayBuffer;
  }

  unmap(): void {
    this.mapped = false;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

describe('Phase 3: Pool Stability Tests', () => {
  let mockDevice: MockGPUDevice;

  beforeAll(() => {
    mockDevice = new MockGPUDevice();
  });

  bench(
    'Pool stability: 1000 frames, 3 archetypes',
    async () => {
      const pool = new StagingBufferPool(mockDevice as any);
      const archetypes = ['particles', 'ui', 'effects'];
      const bufferSize = 4096; // 1K entities × 4 bytes

      for (let frame = 0; frame < 1000; frame++) {
        // Each frame: acquire buffer for 1-2 archetypes randomly
        const activeArchetypes = archetypes.slice(0, 1 + (frame % 2));

        for (const archetype of activeArchetypes) {
          const buffer = pool.acquire(archetype, bufferSize);
          pool.markInFlight(buffer);

          // Simulate async readback
          await (buffer as MockGPUBuffer).mapAsync(1);
          (buffer as MockGPUBuffer).unmap();
          pool.markAvailable(buffer);
        }

        pool.nextFrame();
      }

      // Verify: pool stabilizes at ~3 buffers per archetype (max)
      const stats = pool.getStats();
      expect(stats.totalBuffers).toBeLessThanOrEqual(archetypes.length * 3);
      expect(stats.inFlightCount).toBe(0);
    },
    { iterations: 5, time: 2000 },
  );
});

describe('Phase 3: Buffer Reuse', () => {
  let mockDevice: MockGPUDevice;

  beforeAll(() => {
    mockDevice = new MockGPUDevice();
  });

  bench(
    'Buffer reuse: zero allocation after warmup',
    () => {
      const pool = new StagingBufferPool(mockDevice as any);
      const archetype = 'test';
      const bufferSize = 4096;

      // Warmup: create initial buffer
      for (let i = 0; i < 10; i++) {
        const buffer = pool.acquire(archetype, bufferSize);
        pool.markInFlight(buffer);
        pool.markAvailable(buffer);
        pool.nextFrame();
      }

      const statsBefore = pool.getStats();
      const bufferCountBefore = statsBefore.totalBuffers;

      // Test: 1000 acquire/release cycles should reuse existing buffer
      for (let i = 0; i < 1000; i++) {
        const buffer = pool.acquire(archetype, bufferSize);
        pool.markInFlight(buffer);
        pool.markAvailable(buffer);
        pool.nextFrame();
      }

      const statsAfter = pool.getStats();
      expect(statsAfter.totalBuffers).toBe(bufferCountBefore); // No new allocation
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 3: LRU Reclamation', () => {
  let mockDevice: MockGPUDevice;

  beforeAll(() => {
    mockDevice = new MockGPUDevice();
  });

  bench(
    'LRU reclamation: unused buffers freed after 5 frames',
    () => {
      const pool = new StagingBufferPool(mockDevice as any);
      const archetype = 'test';
      const bufferSize = 4096;

      // Create buffer and use for 1 frame
      const buffer = pool.acquire(archetype, bufferSize);
      pool.markInFlight(buffer);
      pool.markAvailable(buffer);
      pool.nextFrame();

      // Advance 5 frames without using
      for (let i = 0; i < 5; i++) {
        pool.nextFrame();
      }

      // Verify: buffer shLeak Detectionimed
      const stats = pool.getStats();
      expect(stats.totalBuffers).toBe(0);
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 3: Memory & Concurrency', () => {
  let mockDevice: MockGPUDevice;

  beforeAll(() => {
    mockDevice = new MockGPUDevice();
  });

  bench(
    'Memory leak detection: no leaked buffers after 10K operations',
    () => {
      const pool = new StagingBufferPool(mockDevice as any);
      const archetypes = ['a', 'b', 'c', 'd', 'e'];

      // Simulate 10K random operations
      for (let i = 0; i < 10000; i++) {
        const archetype = archetypes[i % archetypes.length];
        const buffer = pool.acquire(archetype, 4096);
        pool.markInFlight(buffer);
        pool.markAvailable(buffer);

        if (i % 10 === 0) {
          pool.nextFrame();
        }
      }

      // Force cleanup
      for (let i = 0; i < 10; i++) {
        pool.nextFrame();
      }

      const stats = pool.getStats();
      // Should stabilize at reasonable count (not leak to thousands)
      expect(stats.totalBuffers).toBeLessThanOrEqual(archetypes.length * 3);
    },
    { iterations: 5, time: 3000 },
  );
});

describe('Phase 3: Concurrent Readback', () => {
  let mockDevice: MockGPUDevice;

  beforeAll(() => {
    mockDevice = new MockGPUDevice();
  });
  bench(
    'Concurrent readback: 100 pending operations',
    async () => {
      const manager = new AsyncReadbackManager();
      const archetypes = Array.from({ length: 100 }, (_, i) => `archetype-${i}`);

      // Enqueue 100 readbacks
      const promises: Promise<void>[] = [];
      for (let i = 0; i < archetypes.length; i++) {
        const buffer = new MockGPUBuffer(i, 4096, `buffer-${i}`) as any;
        const mapPromise = buffer.mapAsync(1);
        promises.push(mapPromise);

        manager.enqueueMapAsync(archetypes[i], [i], buffer, mapPromise, 1000);
      }

      // Wait for all to complete
      await Promise.all(promises);

      // Drain completed
      const results = await manager.drainCompleted();
      expect(results.length).toBeGreaterThan(0);
      expect(manager.getPendingCount()).toBeLessThanOrEqual(100);
    },
    { iterations: 5, time: 2000 },
  );
});

describe('Phase 3: Pool Growth', () => {
  let mockDevice: MockGPUDevice;

  beforeAll(() => {
    mockDevice = new MockGPUDevice();
  });

  bench(
    'Pool growth behavior: expanding from 1→3 buffers per archetype',
    () => {
      const pool = new StagingBufferPool(mockDevice as any);
      const archetype = 'test';
      const bufferSize = 4096;

      // Force growth by holding 3 buffers in-flight
      const buffer1 = pool.acquire(archetype, bufferSize);
      pool.markInFlight(buffer1);

      const buffer2 = pool.acquire(archetype, bufferSize);
      pool.markInFlight(buffer2);

      const buffer3 = pool.acquire(archetype, bufferSize);
      pool.markInFlight(buffer3);

      const stats = pool.getStats();
      expect(stats.totalBuffers).toBe(3);
      expect(stats.inFlightCount).toBe(3);

      // Release and verify reuse
      pool.markAvailable(buffer1);
      pool.markAvailable(buffer2);
      pool.markAvailable(buffer3);

      const statsAfter = pool.getStats();
      expect(statsAfter.inFlightCount).toBe(0);
    },
    { iterations: 50, time: 500, warmupTime: 100, warmupIterations: 10 },
  );
});

describe('Phase 3: Readback Metrics', () => {
  bench(
    'Readback metrics: queue depth and timeout rate',
    async () => {
      const manager = new AsyncReadbackManager();
      const buffer = new MockGPUBuffer(1, 256, 'buffer-metrics') as any;
      const mapPromise = buffer.mapAsync(1);
      manager.enqueueMapAsync('metrics', [1], buffer, mapPromise, 256, 0);
      await mapPromise;
      await Promise.resolve();

      const results = await manager.drainCompleted(10);
      expect(results.length).toBe(1);
      expect(manager.getQueueDepth()).toBe(0);
      expect(manager.getTimeoutRate()).toBe(1);
    },
    { iterations: 10, time: 1000 },
  );
});
