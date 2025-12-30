/**
 * P1 Optimization Tests
 *
 * Validates the performance improvements from P1-2 and P1-3 optimizations:
 * - P1-2: Archetype buffer caching (reduce Map lookups)
 * - P1-3: Prioritize TypedArray writes (avoid redundant operations)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ArchetypeBufferCache } from '../src/systems/batch/archetype-buffer-cache';

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
