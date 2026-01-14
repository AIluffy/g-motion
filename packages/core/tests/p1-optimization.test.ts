/**
 * P1 Optimization Tests
 *
 * Validates the performance improvements from P1-2 and P1-3 optimizations:
 * - P1-2: Archetype buffer caching (reduce Map lookups)
 * - P1-3: Prioritize TypedArray writes (avoid redundant operations)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/systems/webgpu/output-buffer-processing', async () => {
  const actual = await vi.importActual<any>('../src/systems/webgpu/output-buffer-processing');
  return {
    ...actual,
    processOutputBuffer: vi.fn().mockResolvedValue(undefined),
  };
});
import { ArchetypeBufferCache } from '../src/systems/batch/archetype-buffer-cache';
import { processCompletedReadbacks } from '../src/systems/webgpu/system/readback-processing-system';
import * as syncManager from '../src/webgpu/sync-manager';
import { maybeRunViewportCulling } from '../src/systems/webgpu/system/viewport-culling-system';
import * as outputBufferProcessing from '../src/systems/webgpu/output-buffer-processing';
import {
  __getOutputBufferPoolStatsForTests,
  __resetOutputBufferPoolForTests,
  acquirePooledOutputBuffer,
} from '../src/systems/webgpu/output-buffer-pool';

describe('P1 Optimization: Archetype Buffer Cache', () => {
  let cache: ArchetypeBufferCache;
  let mockArchetype: any;

  beforeEach(() => {
    cache = new ArchetypeBufferCache();

    mockArchetype = {
      id: 'test-archetype',
      entityCount: 100,
      getBuffer: (name: string) => {
        return name === 'MotionState' ? [] : undefined;
      },
      getTypedBuffer: (component: string, field: string) => {
        void component;
        void field;
        return new Float32Array(100);
      },
    };
  });

  describe('P1-2: Buffer Caching', () => {
    it('should return undefined on cache miss', () => {
      const buffers = cache.getBuffers(mockArchetype);
      expect(buffers).toBeUndefined();
    });

    it('should cache buffers after setBuffers', () => {
      const testBuffers = {
        stateBuffer: [],
        timelineBuffer: [],
        renderBuffer: [],
        springBuffer: undefined,
        inertiaBuffer: undefined,
        typedStatus: new Float32Array(100),
        typedStartTime: new Float32Array(100),
        typedCurrentTime: new Float32Array(100),
        typedPlaybackRate: new Float32Array(100),
        typedIteration: new Float32Array(100),
        typedTickInterval: new Float32Array(100),
        typedTickPhase: new Float32Array(100),
        typedRendererCode: new Float32Array(100),
        typedTimelineVersion: new Float32Array(100),
      };

      cache.setBuffers(mockArchetype, testBuffers);

      const cached = cache.getBuffers(mockArchetype);
      expect(cached).toBeDefined();
      expect(cached?.stateBuffer).toBe(testBuffers.stateBuffer);
      expect(cached?.typedStatus).toBe(testBuffers.typedStatus);
    });

    it('should invalidate cache when archetype version changes', () => {
      const testBuffers = {
        stateBuffer: [],
        timelineBuffer: [],
        renderBuffer: [],
        springBuffer: undefined,
        inertiaBuffer: undefined,
        typedStatus: new Float32Array(100),
        typedStartTime: new Float32Array(100),
        typedCurrentTime: new Float32Array(100),
        typedPlaybackRate: new Float32Array(100),
        typedIteration: new Float32Array(100),
        typedTickInterval: new Float32Array(100),
        typedTickPhase: new Float32Array(100),
        typedRendererCode: new Float32Array(100),
        typedTimelineVersion: new Float32Array(100),
      };

      cache.setBuffers(mockArchetype, testBuffers);

      // Cache hit
      let cached = cache.getBuffers(mockArchetype);
      expect(cached).toBeDefined();

      // Change archetype version (entity count)
      mockArchetype.entityCount = 150;

      // Cache miss (invalidated)
      cached = cache.getBuffers(mockArchetype);
      expect(cached).toBeUndefined();
    });

    it('should clean up stale cache entries', () => {
      const testBuffers = {
        stateBuffer: [],
        timelineBuffer: [],
        renderBuffer: [],
        springBuffer: undefined,
        inertiaBuffer: undefined,
        typedStatus: new Float32Array(100),
        typedStartTime: new Float32Array(100),
        typedCurrentTime: new Float32Array(100),
        typedPlaybackRate: new Float32Array(100),
        typedIteration: new Float32Array(100),
        typedTickInterval: new Float32Array(100),
        typedTickPhase: new Float32Array(100),
        typedRendererCode: new Float32Array(100),
        typedTimelineVersion: new Float32Array(100),
      };

      cache.setBuffers(mockArchetype, testBuffers);

      // Advance many frames without accessing
      for (let i = 0; i < 400; i++) {
        cache.nextFrame();
      }

      // Cache should be cleaned up
      const stats = cache.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should demonstrate P1-2 cache hit performance', () => {
      const testBuffers = {
        stateBuffer: [],
        timelineBuffer: [],
        renderBuffer: [],
        springBuffer: undefined,
        inertiaBuffer: undefined,
        typedStatus: new Float32Array(100),
        typedStartTime: new Float32Array(100),
        typedCurrentTime: new Float32Array(100),
        typedPlaybackRate: new Float32Array(100),
        typedIteration: new Float32Array(100),
        typedTickInterval: new Float32Array(100),
        typedTickPhase: new Float32Array(100),
        typedRendererCode: new Float32Array(100),
        typedTimelineVersion: new Float32Array(100),
      };

      cache.setBuffers(mockArchetype, testBuffers);

      const iterations = 1000;

      // Measure cache hit performance
      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        const cached = cache.getBuffers(mockArchetype);
        expect(cached).toBeDefined();
      }
      const duration = performance.now() - startTime;

      console.log(
        `P1-2 Cache Hit Performance: ${iterations} lookups in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/lookup)`,
      );

      // Cache hits should be very fast (<0.05ms per lookup)
      expect(duration / iterations).toBeLessThan(0.05);
    });

    it('should demonstrate cache benefit over repeated Map lookups', () => {
      const iterations = 100;

      // Simulate repeated Map lookups (without cache)
      const mockGetBuffer = () => {
        const map = new Map([
          ['MotionState', []],
          ['Timeline', []],
          ['Render', []],
        ]);
        return map.get('MotionState');
      };

      const startWithoutCache = performance.now();
      for (let i = 0; i < iterations; i++) {
        // 8 Map lookups per iteration (simulating BatchSamplingSystem)
        for (let j = 0; j < 8; j++) {
          mockGetBuffer();
        }
      }
      const durationWithoutCache = performance.now() - startWithoutCache;

      // With cache
      const testBuffers = {
        stateBuffer: [],
        timelineBuffer: [],
        renderBuffer: [],
        springBuffer: undefined,
        inertiaBuffer: undefined,
        typedStatus: new Float32Array(100),
        typedStartTime: new Float32Array(100),
        typedCurrentTime: new Float32Array(100),
        typedPlaybackRate: new Float32Array(100),
        typedIteration: new Float32Array(100),
        typedTickInterval: new Float32Array(100),
        typedTickPhase: new Float32Array(100),
        typedRendererCode: new Float32Array(100),
        typedTimelineVersion: new Float32Array(100),
      };

      cache.setBuffers(mockArchetype, testBuffers);

      const startWithCache = performance.now();
      for (let i = 0; i < iterations; i++) {
        // Single cache lookup per iteration
        cache.getBuffers(mockArchetype);
      }
      const durationWithCache = performance.now() - startWithCache;

      const speedup = durationWithoutCache / durationWithCache;

      console.log(
        `P1-2 Cache Speedup: ${speedup.toFixed(2)}x faster (${durationWithoutCache.toFixed(2)}ms → ${durationWithCache.toFixed(2)}ms)`,
      );

      // Cache should be significantly faster
      expect(speedup).toBeGreaterThan(2);
    });
  });
});

describe('P1 Optimization: Readback Expiry Handling', () => {
  beforeEach(() => {
    __resetOutputBufferPoolForTests();
  });

  it('should return staging buffer and release lease on expired readback', async () => {
    const enqueueSpy = vi.spyOn(syncManager, 'enqueueGPUResults');

    const stagingBuffer = {} as any;
    const markAvailable = vi.fn();
    const releaseEntityIds = vi.fn();

    const runtime = {
      readbackManager: {
        drainCompleted: () =>
          Promise.resolve([
            {
              archetypeId: 'arch',
              entityIds: new Int32Array([1]),
              values: new Float32Array([1]),
              stagingBuffer,
              byteSize: 4,
              leaseId: 123,
              expired: true,
            },
          ]),
        getPendingCount: () => 0,
      },
      stagingPool: { markAvailable } as any,
      latestAsyncCullingFrameByArchetype: new Map(),
      webgpuFrameId: 1,
    } as any;

    processCompletedReadbacks({
      runtime,
      device: { queue: {} } as any,
      metricsProvider: { recordMetric: vi.fn() } as any,
      processor: { releaseEntityIds } as any,
      config: {} as any,
      debugIOEnabled: false,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(markAvailable).toHaveBeenCalledWith(stagingBuffer);
    expect(releaseEntityIds).toHaveBeenCalledWith(123);
  });

  it('should destroy culling buffers on expired culling readback', async () => {
    const outputDestroy = vi.fn();
    const readbackDestroy = vi.fn();
    const releaseEntityIds = vi.fn();
    const processOutputBufferMock = vi.mocked(outputBufferProcessing.processOutputBuffer);
    processOutputBufferMock.mockClear();

    const runtime = {
      readbackManager: {
        drainCompleted: () =>
          Promise.resolve([
            {
              archetypeId: 'arch',
              entityIds: new Int32Array([1]),
              stagingBuffer: { destroy: readbackDestroy } as any,
              byteSize: 8,
              leaseId: 555,
              expired: true,
              tag: {
                kind: 'culling',
                frameId: 1,
                outputBuffer: { destroy: outputDestroy } as any,
                rawStride: 1,
                outputStride: 1,
                rawChannels: [],
                outputChannels: [],
                entityCountMax: 1,
                visibleCount: 1,
              },
            },
          ]),
        getPendingCount: () => 0,
      },
      stagingPool: { markAvailable: vi.fn() } as any,
      latestAsyncCullingFrameByArchetype: new Map([['arch', 1]]),
      webgpuFrameId: 1,
    } as any;

    processCompletedReadbacks({
      runtime,
      device: { queue: {} } as any,
      metricsProvider: { recordMetric: vi.fn() } as any,
      processor: { releaseEntityIds } as any,
      config: {} as any,
      debugIOEnabled: false,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(outputDestroy).toHaveBeenCalledTimes(1);
    expect(readbackDestroy).toHaveBeenCalledTimes(1);
    expect(releaseEntityIds).toHaveBeenCalledWith(555);
    expect(processOutputBufferMock).not.toHaveBeenCalled();
  });

  it('should skip culling output processing on stale culling readback', async () => {
    const outputDestroy = vi.fn();
    const readbackDestroy = vi.fn();
    const releaseEntityIds = vi.fn();
    const processOutputBufferMock = vi.mocked(outputBufferProcessing.processOutputBuffer);
    processOutputBufferMock.mockClear();

    const runtime = {
      readbackManager: {
        drainCompleted: () =>
          Promise.resolve([
            {
              archetypeId: 'arch',
              entityIds: new Int32Array([1]),
              stagingBuffer: { destroy: readbackDestroy } as any,
              byteSize: 8,
              leaseId: 777,
              expired: false,
              tag: {
                kind: 'culling',
                frameId: 1,
                outputBuffer: { destroy: outputDestroy } as any,
                rawStride: 1,
                outputStride: 1,
                rawChannels: [],
                outputChannels: [],
                entityCountMax: 1,
                visibleCount: 1,
              },
            },
          ]),
        getPendingCount: () => 0,
      },
      stagingPool: { markAvailable: vi.fn() } as any,
      latestAsyncCullingFrameByArchetype: new Map([['arch', 2]]),
      webgpuFrameId: 2,
    } as any;

    processCompletedReadbacks({
      runtime,
      device: { queue: {} } as any,
      metricsProvider: { recordMetric: vi.fn() } as any,
      processor: { releaseEntityIds } as any,
      config: {} as any,
      debugIOEnabled: false,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(outputDestroy).toHaveBeenCalledTimes(1);
    expect(readbackDestroy).toHaveBeenCalledTimes(1);
    expect(releaseEntityIds).toHaveBeenCalledWith(777);
    expect(processOutputBufferMock).not.toHaveBeenCalled();
  });

  it('should skip culling output processing when visibleCount is zero', async () => {
    const outputDestroy = vi.fn();
    const readbackDestroy = vi.fn();
    const releaseEntityIds = vi.fn();
    const processOutputBufferMock = vi.mocked(outputBufferProcessing.processOutputBuffer);
    processOutputBufferMock.mockClear();

    const runtime = {
      readbackManager: {
        drainCompleted: () =>
          Promise.resolve([
            {
              archetypeId: 'arch',
              entityIds: new Int32Array([1, 2]),
              stagingBuffer: { destroy: readbackDestroy } as any,
              byteSize: 12,
              leaseId: 888,
              expired: false,
              tag: {
                kind: 'culling',
                frameId: 2,
                outputBuffer: { destroy: outputDestroy } as any,
                rawStride: 1,
                outputStride: 1,
                rawChannels: [],
                outputChannels: [],
                entityCountMax: 2,
                visibleCount: 0,
              },
            },
          ]),
        getPendingCount: () => 0,
      },
      stagingPool: { markAvailable: vi.fn() } as any,
      latestAsyncCullingFrameByArchetype: new Map([['arch', 2]]),
      webgpuFrameId: 2,
    } as any;

    processCompletedReadbacks({
      runtime,
      device: { queue: {} } as any,
      metricsProvider: { recordMetric: vi.fn() } as any,
      processor: { releaseEntityIds } as any,
      config: {} as any,
      debugIOEnabled: false,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(outputDestroy).toHaveBeenCalledTimes(1);
    expect(readbackDestroy).toHaveBeenCalledTimes(1);
    expect(releaseEntityIds).toHaveBeenCalledWith(888);
    expect(processOutputBufferMock).not.toHaveBeenCalled();
  });

  it('should process culling output buffer for visible entities', async () => {
    const outputDestroy = vi.fn();
    const readbackDestroy = vi.fn();
    const releaseEntityIds = vi.fn();
    const processOutputBufferMock = vi.mocked(outputBufferProcessing.processOutputBuffer);
    processOutputBufferMock.mockClear();

    const runtime = {
      readbackManager: {
        drainCompleted: () =>
          Promise.resolve([
            {
              archetypeId: 'arch',
              entityIds: new Int32Array([10, 20, 30]),
              stagingBuffer: { destroy: readbackDestroy } as any,
              byteSize: 16,
              leaseId: 999,
              expired: false,
              tag: {
                kind: 'culling',
                frameId: 3,
                outputBuffer: { destroy: outputDestroy } as any,
                rawStride: 2,
                outputStride: 2,
                rawChannels: [],
                outputChannels: [],
                entityCountMax: 3,
                visibleCount: 3,
              },
            },
          ]),
        getPendingCount: () => 0,
      },
      stagingPool: { markAvailable: vi.fn() } as any,
      latestAsyncCullingFrameByArchetype: new Map([['arch', 3]]),
      webgpuFrameId: 3,
    } as any;

    processCompletedReadbacks({
      runtime,
      device: { queue: {} } as any,
      metricsProvider: { recordMetric: vi.fn() } as any,
      processor: { releaseEntityIds } as any,
      config: {} as any,
      debugIOEnabled: false,
    });

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(processOutputBufferMock).toHaveBeenCalledTimes(1);
    const call = processOutputBufferMock.mock.calls[0];
    expect(call?.[5]?.archetypeId).toBe('arch');
    expect(call?.[5]?.entityCount).toBe(3);
    expect(call?.[5]?.entityIdsForReadback).toEqual(new Int32Array([10, 20, 30]));
    expect(readbackDestroy).toHaveBeenCalledTimes(1);
    expect(releaseEntityIds).not.toHaveBeenCalled();
  });
});

describe('P1 Optimization: Output Buffer Reuse', () => {
  beforeEach(() => {
    __resetOutputBufferPoolForTests();
  });

  it('should release pooled output buffer after readback completes', async () => {
    const enqueueSpy = vi.spyOn(syncManager, 'enqueueGPUResults');

    const bufferDestroy = vi.fn();
    const device = {
      queue: {},
      createBuffer: vi.fn(() => ({ destroy: bufferDestroy }) as any),
    } as any;

    const acquired = acquirePooledOutputBuffer({
      device,
      archetypeId: 'arch',
      requestedByteSize: 64,
      usage: 1,
      label: 'output-arch',
    });

    const runtime = {
      readbackManager: {
        drainCompleted: () =>
          Promise.resolve([
            {
              archetypeId: 'arch',
              entityIds: new Int32Array([1]),
              values: new Float32Array([1]),
              stagingBuffer: {} as any,
              byteSize: 4,
              leaseId: 123,
              expired: false,
              tag: acquired.tag,
            },
          ]),
        getPendingCount: () => 0,
      },
      stagingPool: { markAvailable: vi.fn() } as any,
      latestAsyncCullingFrameByArchetype: new Map(),
      webgpuFrameId: 1,
    } as any;

    processCompletedReadbacks({
      runtime,
      device,
      metricsProvider: { recordMetric: vi.fn() } as any,
      processor: { releaseEntityIds: vi.fn() } as any,
      config: {} as any,
      debugIOEnabled: false,
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(bufferDestroy).not.toHaveBeenCalled();

    const stats = __getOutputBufferPoolStatsForTests(device);
    expect(stats.acquireCount).toBe(1);
    expect(stats.createCount).toBe(1);
    expect(stats.releaseCount).toBe(1);
    expect(stats.availableBufferCount).toBe(1);
  });

  it('should reuse pooled output buffer for same key', () => {
    const device = {
      createBuffer: vi.fn(() => ({ destroy: vi.fn() }) as any),
    } as any;

    const first = acquirePooledOutputBuffer({
      device,
      archetypeId: 'arch',
      requestedByteSize: 64,
      usage: 1,
      label: 'output-arch',
    });

    const runtime = {
      readbackManager: {
        drainCompleted: () =>
          Promise.resolve([
            {
              archetypeId: 'arch',
              entityIds: new Int32Array([1]),
              values: new Float32Array([1]),
              stagingBuffer: {} as any,
              byteSize: 4,
              expired: false,
              tag: first.tag,
            },
          ]),
        getPendingCount: () => 0,
      },
      stagingPool: { markAvailable: vi.fn() } as any,
      latestAsyncCullingFrameByArchetype: new Map(),
      webgpuFrameId: 1,
    } as any;

    processCompletedReadbacks({
      runtime,
      device: { queue: {} } as any,
      metricsProvider: { recordMetric: vi.fn() } as any,
      processor: { releaseEntityIds: vi.fn() } as any,
      config: {} as any,
      debugIOEnabled: false,
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const second = acquirePooledOutputBuffer({
          device,
          archetypeId: 'arch',
          requestedByteSize: 64,
          usage: 1,
          label: 'output-arch',
        });

        expect(second.buffer).toBe(first.buffer);

        const stats = __getOutputBufferPoolStatsForTests(device);
        expect(stats.acquireCount).toBe(2);
        expect(stats.createCount).toBe(1);
        expect(stats.reuseCount).toBe(1);
        resolve();
      }, 0);
    });
  });
});

describe('P1 Optimization: Visible Readback Guard', () => {
  it('should skip viewport culling when viewport is unavailable', async () => {
    const hadWindow = 'window' in globalThis;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = { ...(originalWindow ?? {}), innerWidth: 0, innerHeight: 0 };

    try {
      const res = await maybeRunViewportCulling({
        runtime: {
          readbackManager: null,
          latestAsyncCullingFrameByArchetype: new Map(),
          webgpuFrameId: 1,
        } as any,
        device: {} as any,
        queue: {} as any,
        world: {} as any,
        processor: {} as any,
        archetypeId: 'arch',
        batch: {} as any,
        outputBuffer: {} as any,
        entityCount: 1,
        entityIdsForReadback: new Int32Array([1]),
        leaseId: undefined,
        rawStride: 1,
        outputStride: 1,
        rawChannels: [],
        outputChannels: [],
        asyncEnabled: true,
      });

      expect(res.kind).toBe('continue');
    } finally {
      if (hadWindow) {
        (globalThis as any).window = originalWindow;
      } else {
        delete (globalThis as any).window;
      }
    }
  });
});
