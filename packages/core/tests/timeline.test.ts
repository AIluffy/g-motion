import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineComponent } from '../src/components/timeline/schema';
import {
  findActiveKeyframe,
  findActiveKeyframeCached,
  isTrackSorted,
} from '../src/components/timeline/search';
import {
  clearKeyframeCache,
  getKeyframeCacheStats,
  prewarmKeyframeCache,
} from '../src/components/timeline/cache';
import {
  linearSearchKeyframe,
  binarySearchKeyframe,
} from '../src/components/timeline/search-algorithms';
import type { Keyframe, Track } from '@g-motion/shared';

describe('Timeline Component', () => {
  it('should export schema with correct properties', () => {
    expect(TimelineComponent).toBeDefined();
    expect(TimelineComponent.schema).toBeDefined();
    expect(TimelineComponent.schema.tracks).toBe('object');
    expect(TimelineComponent.schema.duration).toBe('float64');
    expect(TimelineComponent.schema.loop).toBe('int32');
    expect(TimelineComponent.schema.repeat).toBe('int32');
    expect(TimelineComponent.schema.version).toBe('int32');
    expect(TimelineComponent.schema.rovingApplied).toBe('int32');
  });
});

describe('Search Algorithms', () => {
  describe('linearSearchKeyframe', () => {
    it('should return -1 for empty track', () => {
      const track: Track = [];
      expect(linearSearchKeyframe(track, 100)).toBe(-1);
    });

    it('should find keyframe in single element track', () => {
      const track: Track = [
        { startTime: 0, time: 100, startValue: 0, endValue: 100, interp: 'linear' },
      ];
      expect(linearSearchKeyframe(track, 50)).toBe(0);
    });

    it('should find correct keyframe in multi-element track', () => {
      const track: Track = [
        { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
        { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
        { startTime: 200, time: 300, startValue: 100, endValue: 150, interp: 'linear' },
      ];
      expect(linearSearchKeyframe(track, 50)).toBe(0);
      expect(linearSearchKeyframe(track, 150)).toBe(1);
      expect(linearSearchKeyframe(track, 250)).toBe(2);
    });

    it('should return -1 when time is before all keyframes', () => {
      const track: Track = [
        { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
      ];
      expect(linearSearchKeyframe(track, 50)).toBe(-1);
    });

    it('should return last index when time is after all keyframes', () => {
      const track: Track = [
        { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
      ];
      expect(linearSearchKeyframe(track, 200)).toBe(0);
    });
  });

  describe('binarySearchKeyframe', () => {
    it('should return -1 for empty track', () => {
      const track: Track = [];
      expect(binarySearchKeyframe(track, 100)).toBe(-1);
    });

    it('should find keyframe in single element track', () => {
      const track: Track = [
        { startTime: 0, time: 100, startValue: 0, endValue: 100, interp: 'linear' },
      ];
      expect(binarySearchKeyframe(track, 50)).toBe(0);
    });

    it('should find correct keyframe in multi-element track', () => {
      const track: Track = [
        { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
        { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
        { startTime: 200, time: 300, startValue: 100, endValue: 150, interp: 'linear' },
      ];
      expect(binarySearchKeyframe(track, 50)).toBe(0);
      expect(binarySearchKeyframe(track, 150)).toBe(1);
      expect(binarySearchKeyframe(track, 250)).toBe(2);
    });

    it('should return -1 when time is before all keyframes', () => {
      const track: Track = [
        { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
      ];
      expect(binarySearchKeyframe(track, 50)).toBe(-1);
    });

    it('should return last index when time is after all keyframes', () => {
      const track: Track = [
        { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
      ];
      expect(binarySearchKeyframe(track, 200)).toBe(0);
    });
  });
});

describe('findActiveKeyframe', () => {
  beforeEach(() => {
    clearKeyframeCache();
  });

  it('should return undefined for empty track', () => {
    expect(findActiveKeyframe([], 100)).toBeUndefined();
    expect(findActiveKeyframe(null as unknown as Track, 100)).toBeUndefined();
  });

  it('should handle single keyframe', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 100, interp: 'linear' },
    ];
    expect(findActiveKeyframe(track, 50)).toBe(track[0]);
    expect(findActiveKeyframe(track, 150)).toBeUndefined();
  });

  it('should find keyframe in sorted track', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
      { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
      { startTime: 200, time: 300, startValue: 100, endValue: 150, interp: 'linear' },
    ];
    expect(findActiveKeyframe(track, 50)).toBe(track[0]);
    expect(findActiveKeyframe(track, 150)).toBe(track[1]);
    expect(findActiveKeyframe(track, 250)).toBe(track[2]);
  });

  it('should return first keyframe for unsorted track when time is within range', () => {
    const track: Track = [
      { startTime: 200, time: 300, startValue: 100, endValue: 150, interp: 'linear' },
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
    ];
    expect(findActiveKeyframe(track, 50)).toEqual(track[1]);
  });
});

describe('findActiveKeyframeCached', () => {
  beforeEach(() => {
    clearKeyframeCache();
  });

  it('should use cache for sequential playback', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
      { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
      { startTime: 200, time: 300, startValue: 100, endValue: 150, interp: 'linear' },
    ];

    const cacheKey = 'entity1:x';

    expect(findActiveKeyframeCached(track, 50, cacheKey)).toBe(track[0]);
    expect(findActiveKeyframeCached(track, 150, cacheKey)).toBe(track[1]);
    expect(findActiveKeyframeCached(track, 250, cacheKey)).toBe(track[2]);

    const stats = getKeyframeCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.keys).toContain(cacheKey);
  });

  it('should handle cache miss correctly', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
      { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
    ];

    const cacheKey = 'entity1:y';

    expect(findActiveKeyframeCached(track, 50, cacheKey)).toBe(track[0]);

    const stats = getKeyframeCacheStats();
    expect(stats.size).toBe(1);
  });

  it('should update cache with sequential forward playback', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
      { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
    ];

    const cacheKey = 'entity2:prop';

    const kf1 = findActiveKeyframeCached(track, 50, cacheKey);
    expect(kf1).toBe(track[0]);
    expect(getKeyframeCacheStats().size).toBe(1);

    const kf2 = findActiveKeyframeCached(track, 150, cacheKey);
    expect(kf2).toBe(track[1]);
    expect(getKeyframeCacheStats().size).toBe(1);
    expect(getKeyframeCacheStats().keys).toContain(cacheKey);
  });
});

function positionCacheGet(key: string): number | undefined {
  return getKeyframeCacheStats().keys.includes(key) ? 0 : undefined;
}

describe('Cache Functions', () => {
  beforeEach(() => {
    clearKeyframeCache();
  });

  it('should clear specific cache key', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
    ];
    prewarmKeyframeCache([
      { cacheKey: 'entity1:x', track, startTime: 50 },
      { cacheKey: 'entity1:y', track, startTime: 50 },
    ]);

    clearKeyframeCache('entity1:x');

    const stats = getKeyframeCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.keys).toContain('entity1:y');
  });

  it('should clear all cache when no key provided', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
    ];
    prewarmKeyframeCache([
      { cacheKey: 'entity1:x', track, startTime: 50 },
      { cacheKey: 'entity1:y', track, startTime: 50 },
    ]);

    clearKeyframeCache();

    const stats = getKeyframeCacheStats();
    expect(stats.size).toBe(0);
  });

  it('should return empty cache stats initially', () => {
    const stats = getKeyframeCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.keys).toHaveLength(0);
  });

  it('should populate cache after prewarm', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
    ];

    prewarmKeyframeCache([{ cacheKey: 'test:prop', track, startTime: 50 }]);

    const stats = getKeyframeCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.keys).toContain('test:prop');
  });
});

describe('isTrackSorted', () => {
  it('should return true for empty track', () => {
    expect(isTrackSorted([])).toBe(true);
  });

  it('should return true for single element track', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 100, interp: 'linear' },
    ];
    expect(isTrackSorted(track)).toBe(true);
  });

  it('should return true for sorted track', () => {
    const track: Track = [
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
      { startTime: 100, time: 200, startValue: 50, endValue: 100, interp: 'linear' },
      { startTime: 200, time: 300, startValue: 100, endValue: 150, interp: 'linear' },
    ];
    expect(isTrackSorted(track)).toBe(true);
  });

  it('should return false for unsorted track', () => {
    const track: Track = [
      { startTime: 200, time: 300, startValue: 100, endValue: 150, interp: 'linear' },
      { startTime: 0, time: 100, startValue: 0, endValue: 50, interp: 'linear' },
    ];
    expect(isTrackSorted(track)).toBe(false);
  });
});
