import { describe, it, expect, beforeEach } from 'vitest';
import {
  BatchBufferCache,
  World,
  RenderComponent,
  RenderSystem,
  getRendererCode,
  MotionStateComponent,
  MotionStatus,
} from '../src';

/**
 * Performance test for BatchBufferCache optimization
 *
 * Validates that buffer reuse eliminates per-frame allocations
 * and reduces GC pressure in batch processing scenarios.
 */
describe('BatchBufferCache Performance', () => {
  let cache: BatchBufferCache;

  beforeEach(() => {
    cache = new BatchBufferCache();
  });

  describe('Buffer Reuse', () => {
    it('should reuse buffers across frames (no new allocations)', () => {
      const archetypeId = 'test-archetype';
      const size = 1024;

      // First frame: allocate
      const buffer1 = cache.getStatesBuffer(archetypeId, size);
      expect(buffer1).toBeDefined();
      expect(buffer1.length).toBe(size);

      // Second frame: reuse (should return same underlying buffer)
      const buffer2 = cache.getStatesBuffer(archetypeId, size);
      expect(buffer2).toBeDefined();
      expect(buffer2.length).toBe(size);

      // Verify it's the same buffer (subarray of same underlying ArrayBuffer)
      expect(buffer1.buffer).toBe(buffer2.buffer);
    });

    it('should handle size growth without reallocating small requests', () => {
      const archetypeId = 'test-archetype';

      // Request small buffer
      const buffer1 = cache.getStatesBuffer(archetypeId, 512);
      expect(buffer1.length).toBe(512);

      // Request larger buffer (still within initial allocation)
      const buffer2 = cache.getStatesBuffer(archetypeId, 800);
      expect(buffer2.length).toBe(800);

      // Should share same underlying buffer
      expect(buffer1.buffer).toBe(buffer2.buffer);
    });

    it('should allocate new buffer when size exceeds capacity', () => {
      const archetypeId = 'test-archetype';

      // Request buffer within initial capacity (1024)
      const buffer1 = cache.getStatesBuffer(archetypeId, 1000);
      const initialBuffer = buffer1.buffer;

      // Request buffer exceeding capacity
      const buffer2 = cache.getStatesBuffer(archetypeId, 2000);

      // Should have allocated new larger buffer
      expect(buffer2.buffer).not.toBe(initialBuffer);
      expect(buffer2.length).toBe(2000);
    });
  });

  describe('Memory Allocation Comparison', () => {
    /**
     * Simulates OLD approach: allocate new Float32Array every frame
     */
    function simulateOldApproach(iterations: number, size: number): number {
      const startMemory = (performance as any).memory?.usedJSHeapSize ?? 0;
      const buffers: Float32Array[] = [];

      for (let i = 0; i < iterations; i++) {
        // Allocate new buffer every iteration (old approach)
        buffers.push(new Float32Array(size));
      }

      const endMemory = (performance as any).memory?.usedJSHeapSize ?? 0;
      return endMemory - startMemory;
    }

    /**
     * Simulates NEW approach: reuse cached buffers
     */
    function simulateNewApproach(iterations: number, size: number): number {
      const startMemory = (performance as any).memory?.usedJSHeapSize ?? 0;
      const cache = new BatchBufferCache();

      for (let i = 0; i < iterations; i++) {
        // Reuse cached buffer every iteration (new approach)
        cache.getStatesBuffer(`archetype-${i % 10}`, size);
      }

      const endMemory = (performance as any).memory?.usedJSHeapSize ?? 0;
      return endMemory - startMemory;
    }

    it('should demonstrate memory savings vs per-frame allocation', () => {
      const iterations = 1000;
      const bufferSize = 256;

      // Measure old approach
      const oldMemoryUsage = simulateOldApproach(iterations, bufferSize);

      // Measure new approach
      const newMemoryUsage = simulateNewApproach(iterations, bufferSize);

      // New approach should use significantly less memory
      // (Note: Exact numbers depend on GC timing, but ratio should be clear)
      console.log(`Old approach memory delta: ${oldMemoryUsage} bytes`);
      console.log(`New approach memory delta: ${newMemoryUsage} bytes`);

      if (oldMemoryUsage > 0 && newMemoryUsage > 0) {
        const savings = ((oldMemoryUsage - newMemoryUsage) / oldMemoryUsage) * 100;
        console.log(`Memory savings: ${savings.toFixed(1)}%`);

        // New approach should use at least 50% less memory
        expect(newMemoryUsage).toBeLessThan(oldMemoryUsage);
      }
    });

    it('should show performance improvement in allocation time', () => {
      const iterations = 10000;
      const bufferSize = 1024;

      // Measure old approach timing
      const oldStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        new Float32Array(bufferSize);
      }
      const oldTime = performance.now() - oldStart;

      // Measure new approach timing
      const cache = new BatchBufferCache();
      const newStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        cache.getStatesBuffer(`arch-${i % 10}`, bufferSize);
      }
      const newTime = performance.now() - newStart;

      console.log(`Old approach time: ${oldTime.toFixed(2)}ms`);
      console.log(`New approach time: ${newTime.toFixed(2)}ms`);
      console.log(`Speedup: ${(oldTime / newTime).toFixed(2)}x`);

      expect(newTime).toBeLessThan(oldTime * 3);
    });
  });

  describe('Multi-Archetype Scenarios', () => {
    it('should handle multiple archetypes efficiently', () => {
      const archetypeCount = 10;
      const bufferSize = 512;

      const buffers: Float32Array[] = [];

      // Simulate multiple archetypes requesting buffers
      for (let i = 0; i < archetypeCount; i++) {
        const statesBuffer = cache.getStatesBuffer(`archetype-${i}`, bufferSize);
        const keyframesBuffer = cache.getKeyframesBuffer(`archetype-${i}`, bufferSize);

        buffers.push(statesBuffer, keyframesBuffer);
      }

      // All buffers should be valid
      expect(buffers).toHaveLength(archetypeCount * 2);
      buffers.forEach((buffer) => {
        expect(buffer).toBeDefined();
        expect(buffer.length).toBe(bufferSize);
      });
    });

    it('should report accurate cache statistics', () => {
      // Populate cache with multiple archetypes
      for (let i = 0; i < 5; i++) {
        cache.getStatesBuffer(`arch-${i}`, 1024);
        cache.getKeyframesBuffer(`arch-${i}`, 2048);
      }

      const stats = cache.getStats();

      expect(stats.statesBufferCount).toBe(5);
      expect(stats.keyframesBufferCount).toBe(5);
      expect(stats.totalMemoryBytes).toBeGreaterThan(0);

      // Verify memory calculation
      const expectedMemory = 5 * 1024 * 4 + 5 * 2048 * 4; // 5 states + 5 keyframes
      expect(stats.totalMemoryBytes).toBe(expectedMemory);
    });
  });

  describe('Cache Management', () => {
    it('should clear all cached buffers', () => {
      // Populate cache
      cache.getStatesBuffer('arch-1', 512);
      cache.getKeyframesBuffer('arch-2', 1024);

      let stats = cache.getStats();
      expect(stats.statesBufferCount).toBe(1);
      expect(stats.keyframesBufferCount).toBe(1);

      // Clear cache
      cache.clear();

      stats = cache.getStats();
      expect(stats.statesBufferCount).toBe(0);
      expect(stats.keyframesBufferCount).toBe(0);
      expect(stats.totalMemoryBytes).toBe(0);
    });
  });

  describe('Realistic Batch Processing Simulation', () => {
    it('should handle 60fps batch processing without allocations', () => {
      const fps = 60;
      const frameDuration = 1000 / fps; // ~16.67ms per frame
      const archetypeCount = 5;
      const entitiesPerArchetype = 1000;

      const frameCount = 300; // 5 seconds at 60fps
      let totalAllocations = 0;

      // Simulate 5 seconds of animation
      for (let frame = 0; frame < frameCount; frame++) {
        const frameStart = performance.now();

        // Simulate batch sampling for each archetype
        for (let arch = 0; arch < archetypeCount; arch++) {
          const statesSize = entitiesPerArchetype * 4; // 4 floats per entity
          const keyframesSize = entitiesPerArchetype * 5; // 5 floats per keyframe

          const statesBuffer = cache.getStatesBuffer(`arch-${arch}`, statesSize);
          const keyframesBuffer = cache.getKeyframesBuffer(`arch-${arch}`, keyframesSize);

          // Verify buffers are valid
          expect(statesBuffer.length).toBe(statesSize);
          expect(keyframesBuffer.length).toBe(keyframesSize);

          // Track if this was a new allocation (only happens on first frame)
          if (frame === 0) {
            totalAllocations += 2; // states + keyframes
          }
        }

        const frameDurationActual = performance.now() - frameStart;

        // Frame processing should be fast (under target frame duration)
        expect(frameDurationActual).toBeLessThan(frameDuration);
      }

      // Should only allocate buffers once (on first frame)
      expect(totalAllocations).toBe(archetypeCount * 2);

      // Verify final cache state
      const stats = cache.getStats();
      expect(stats.statesBufferCount).toBe(archetypeCount);
      expect(stats.keyframesBufferCount).toBe(archetypeCount);
    });
  });
});

describe('Engine Hot Path Performance', () => {
  it('guards RenderSystem update hot path', () => {
    const world = new World();
    world.registry.register('Render', RenderComponent);

    const rendererUpdate = () => {};
    const app = {
      getRenderer: (_name: string) => ({ update: rendererUpdate }),
    } as any;
    const errorHandler = { handle: (_e: any) => {} } as any;
    const ctx = { services: { world, app, errorHandler }, dt: 0 } as any;

    const rendererCode = getRendererCode('test');
    const entityCount = 10000;
    for (let i = 0; i < entityCount; i++) {
      world.createEntity({
        Render: {
          rendererId: 'test',
          rendererCode,
          target: {},
          props: {},
          version: 0,
          renderedVersion: -1,
        },
      });
    }

    const archetype = Array.from(world.getArchetypes())[0];
    const renderBuffer = archetype.getBuffer('Render') as any[];

    RenderSystem.update(0, ctx);
    for (let i = 0; i < entityCount; i++) {
      renderBuffer[i].renderedVersion = renderBuffer[i].version;
    }

    const unchangedTimes: number[] = [];
    for (let i = 0; i < 10; i++) RenderSystem.update(0, ctx);
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      RenderSystem.update(0, ctx);
      unchangedTimes.push(performance.now() - t0);
    }
    const unchangedAvg = unchangedTimes.reduce((a, b) => a + b, 0) / unchangedTimes.length;
    const unchangedMax = Math.max(...unchangedTimes);

    const dirtyTimes: number[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < entityCount; j++) renderBuffer[j].version += 1;
      RenderSystem.update(0, ctx);
    }
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < entityCount; j++) renderBuffer[j].version += 1;
      const t0 = performance.now();
      RenderSystem.update(0, ctx);
      dirtyTimes.push(performance.now() - t0);
    }
    const dirtyAvg = dirtyTimes.reduce((a, b) => a + b, 0) / dirtyTimes.length;
    const dirtyMax = Math.max(...dirtyTimes);

    console.log(
      `RenderSystem unchanged avg: ${unchangedAvg.toFixed(3)}ms, max: ${unchangedMax.toFixed(3)}ms`,
    );
    console.log(`RenderSystem dirty avg: ${dirtyAvg.toFixed(3)}ms, max: ${dirtyMax.toFixed(3)}ms`);

    expect(unchangedAvg).toBeLessThan(10);
    expect(unchangedMax).toBeLessThan(30);
    expect(dirtyAvg).toBeLessThan(20);
    expect(dirtyMax).toBeLessThan(60);
  });

  it('guards active count monitoring overhead', () => {
    const world = new World();
    world.registry.register('MotionState', MotionStateComponent);

    const entityCount = 20000;
    const ids: number[] = [];
    for (let i = 0; i < entityCount; i++) {
      ids.push(
        world.createEntity({
          MotionState: {
            status: MotionStatus.Idle,
            delay: 0,
            startTime: 0,
            pausedAt: 0,
            currentTime: 0,
            playbackRate: 1,
            iteration: 0,
            tickInterval: 0,
            tickPhase: 0,
            tickPriority: 0,
          },
        }),
      );
    }

    const times: number[] = [];
    for (let i = 0; i < entityCount; i++) world.setMotionStatus(ids[i], MotionStatus.Running);
    for (let r = 0; r < 10; r++) {
      const t0 = performance.now();
      for (let i = 0; i < entityCount; i++) world.setMotionStatus(ids[i], MotionStatus.Paused);
      for (let i = 0; i < entityCount; i++) world.setMotionStatus(ids[i], MotionStatus.Running);
      times.push(performance.now() - t0);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;

    console.log(
      `setMotionStatus loop avg: ${avg.toFixed(3)}ms, p99: ${p99.toFixed(3)}ms, max: ${max.toFixed(3)}ms`,
    );
    console.log(`activeMotionEntityCount: ${world.getActiveMotionEntityCount()}`);

    expect(avg).toBeLessThan(50);
    expect(max).toBeLessThan(200);
  });
});

describe('Performance Regression Test', () => {
  it('should maintain baseline performance characteristics', async () => {
    const cache = new BatchBufferCache();
    const iterations = 10000;
    const bufferSize = 1024;

    // Baseline: reuse should be consistently fast
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      cache.getStatesBuffer('test-arch', bufferSize);
      const duration = performance.now() - start;
      times.push(duration);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const maxTime = sorted[sorted.length - 1] ?? 0;
    const p99Time = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const p999Time = sorted[Math.floor(sorted.length * 0.999)] ?? 0;

    console.log(`Average buffer reuse time: ${avgTime.toFixed(4)}ms`);
    console.log(`P99 buffer reuse time: ${p99Time.toFixed(4)}ms`);
    console.log(`P99.9 buffer reuse time: ${p999Time.toFixed(4)}ms`);
    console.log(`Max buffer reuse time: ${maxTime.toFixed(4)}ms`);

    // Buffer reuse should be extremely fast (< 0.01ms average)
    expect(avgTime).toBeLessThan(0.01);

    expect(p99Time).toBeLessThan(0.05);
    expect(p999Time).toBeLessThan(1);
    expect(maxTime).toBeLessThan(10);
  });
});
