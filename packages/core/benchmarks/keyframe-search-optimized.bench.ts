import { describe, bench, beforeEach } from 'vitest';
import {
  findActiveKeyframe,
  clearKeyframeCache,
  prewarmKeyframeCache,
  isTrackSorted,
} from '../src/components/timeline';
import type { Keyframe } from '@g-motion/shared';

describe('Keyframe Search Performance', () => {
  let smallTrack: Keyframe[];
  let mediumTrack: Keyframe[];
  let largeTrack: Keyframe[];
  let veryLargeTrack: Keyframe[];

  beforeEach(() => {
    // Small track: 10 keyframes
    smallTrack = Array.from({ length: 10 }, (_, i) => ({
      startTime: i * 100,
      time: (i + 1) * 100,
      startValue: i,
      endValue: i + 1,
      easing: 'linear' as const,
    }));

    // Medium track: 50 keyframes
    mediumTrack = Array.from({ length: 50 }, (_, i) => ({
      startTime: i * 100,
      time: (i + 1) * 100,
      startValue: i,
      endValue: i + 1,
      easing: 'linear' as const,
    }));

    // Large track: 200 keyframes
    largeTrack = Array.from({ length: 200 }, (_, i) => ({
      startTime: i * 50,
      time: (i + 1) * 50,
      startValue: i,
      endValue: i + 1,
      easing: 'linear' as const,
    }));

    // Very large track: 1000 keyframes
    veryLargeTrack = Array.from({ length: 1000 }, (_, i) => ({
      startTime: i * 10,
      time: (i + 1) * 10,
      startValue: i,
      endValue: i + 1,
      easing: 'linear' as const,
    }));

    // Clear cache before each test
    clearKeyframeCache();
  });

  describe('Small Track (10 keyframes)', () => {
    bench('Linear search - middle element', () => {
      findActiveKeyframe(smallTrack, 450);
    });

    bench('With cache - sequential forward', () => {
      for (let i = 0; i < 10; i++) {
        findActiveKeyframe(smallTrack, i * 100 + 50, 'entity1:x');
      }
      clearKeyframeCache();
    });

    bench('Without cache - sequential forward', () => {
      for (let i = 0; i < 10; i++) {
        findActiveKeyframe(smallTrack, i * 100 + 50);
      }
    });

    bench('Random access (worst case)', () => {
      const times = [850, 150, 650, 250, 950, 350, 750, 450, 550, 50];
      for (const time of times) {
        findActiveKeyframe(smallTrack, time);
      }
    });
  });

  describe('Medium Track (50 keyframes)', () => {
    bench('Binary search - middle element', () => {
      findActiveKeyframe(mediumTrack, 2450);
    });

    bench('Binary search - first element', () => {
      findActiveKeyframe(mediumTrack, 50);
    });

    bench('Binary search - last element', () => {
      findActiveKeyframe(mediumTrack, 4950);
    });

    bench('With cache - sequential playback', () => {
      for (let i = 0; i < 50; i++) {
        findActiveKeyframe(mediumTrack, i * 100 + 50, 'entity2:x');
      }
      clearKeyframeCache();
    });

    bench('Without cache - sequential playback', () => {
      for (let i = 0; i < 50; i++) {
        findActiveKeyframe(mediumTrack, i * 100 + 50);
      }
    });

    bench('Cache hit rate test (99% sequential)', () => {
      let time = 50;
      for (let i = 0; i < 100; i++) {
        findActiveKeyframe(mediumTrack, time, 'entity2:x');
        time += 100; // Sequential forward
        if (time > 5000) time = 50; // Loop back
      }
      clearKeyframeCache();
    });
  });

  describe('Large Track (200 keyframes)', () => {
    bench('Binary search - middle element', () => {
      findActiveKeyframe(largeTrack, 5025);
    });

    bench('Binary search - random access', () => {
      const times = [1025, 8525, 3025, 9525, 525, 7025, 4525, 2025, 6525, 125];
      for (const time of times) {
        findActiveKeyframe(largeTrack, time);
      }
    });

    bench('With cache - sequential playback', () => {
      for (let i = 0; i < 200; i++) {
        findActiveKeyframe(largeTrack, i * 50 + 25, 'entity3:x');
      }
      clearKeyframeCache();
    });

    bench('Without cache - sequential playback', () => {
      for (let i = 0; i < 200; i++) {
        findActiveKeyframe(largeTrack, i * 50 + 25);
      }
    });

    bench('Mixed access pattern (60% sequential)', () => {
      let time = 25;
      for (let i = 0; i < 200; i++) {
        findActiveKeyframe(largeTrack, time, 'entity3:x');
        if (Math.random() < 0.6) {
          time += 50; // Sequential
        } else {
          time = Math.floor(Math.random() * 10000); // Random jump
        }
        if (time > 10000) time = 25;
      }
      clearKeyframeCache();
    });
  });

  describe('Very Large Track (1000 keyframes)', () => {
    bench('Binary search - middle element', () => {
      findActiveKeyframe(veryLargeTrack, 5005);
    });

    bench('Binary search - stress test (100 random lookups)', () => {
      for (let i = 0; i < 100; i++) {
        const time = Math.floor(Math.random() * 10000);
        findActiveKeyframe(veryLargeTrack, time);
      }
    });

    bench('With cache - sequential playback', () => {
      for (let i = 0; i < 1000; i++) {
        findActiveKeyframe(veryLargeTrack, i * 10 + 5, 'entity4:x');
      }
      clearKeyframeCache();
    });

    bench('Without cache - sequential playback', () => {
      for (let i = 0; i < 1000; i++) {
        findActiveKeyframe(veryLargeTrack, i * 10 + 5);
      }
    });

    bench('Backward playback (cache still effective)', () => {
      for (let i = 999; i >= 0; i--) {
        findActiveKeyframe(veryLargeTrack, i * 10 + 5, 'entity4:x');
      }
      clearKeyframeCache();
    });
  });

  describe('Real-world Scenarios', () => {
    bench('60fps animation (1000 frames, 200 keyframes)', () => {
      const duration = 10000; // 10 seconds
      const fps = 60;
      const frameCount = duration / (1000 / fps);

      for (let frame = 0; frame < frameCount; frame++) {
        const time = (frame / frameCount) * duration;
        findActiveKeyframe(largeTrack, time, 'realworld:x');
      }
      clearKeyframeCache();
    });

    bench('Multi-entity simulation (100 entities, 50 keyframes each)', () => {
      for (let entityId = 0; entityId < 100; entityId++) {
        for (let prop of ['x', 'y', 'scale']) {
          const cacheKey = `entity${entityId}:${prop}`;
          const time = Math.random() * 5000;
          findActiveKeyframe(mediumTrack, time, cacheKey);
        }
      }
      clearKeyframeCache();
    });

    bench('Scrubbing timeline (seeking back and forth)', () => {
      const times = [0, 1000, 500, 3000, 1500, 4000, 2000, 5000, 2500, 0];
      for (const time of times) {
        findActiveKeyframe(largeTrack, time, 'scrubbing:x');
      }
      clearKeyframeCache();
    });

    bench('Cache prewarm benefit', () => {
      // Prewarm cache
      prewarmKeyframeCache([
        { cacheKey: 'prewarm:x', track: largeTrack, startTime: 0 },
        { cacheKey: 'prewarm:y', track: largeTrack, startTime: 0 },
        { cacheKey: 'prewarm:scale', track: largeTrack, startTime: 0 },
      ]);

      // Sequential access (should be fast due to prewarm)
      for (let i = 0; i < 50; i++) {
        findActiveKeyframe(largeTrack, i * 50 + 25, 'prewarm:x');
      }
      clearKeyframeCache();
    });
  });

  describe('Edge Cases', () => {
    bench('Empty track', () => {
      findActiveKeyframe([], 1000);
    });

    bench('Single keyframe', () => {
      const single: Keyframe[] = [
        {
          startTime: 0,
          time: 1000,
          startValue: 0,
          endValue: 100,
          easing: 'linear',
        },
      ];
      findActiveKeyframe(single, 500);
    });

    bench('Two keyframes', () => {
      const two: Keyframe[] = [
        {
          startTime: 0,
          time: 500,
          startValue: 0,
          endValue: 50,
          easing: 'linear',
        },
        {
          startTime: 500,
          time: 1000,
          startValue: 50,
          endValue: 100,
          easing: 'linear',
        },
      ];
      findActiveKeyframe(two, 750);
    });

    bench('Time before first keyframe', () => {
      findActiveKeyframe(smallTrack, -100);
    });

    bench('Time after last keyframe', () => {
      findActiveKeyframe(smallTrack, 99999);
    });
  });

  describe('Cache Management', () => {
    bench('Cache size growth (1000 unique keys)', () => {
      for (let i = 0; i < 1000; i++) {
        findActiveKeyframe(mediumTrack, 2500, `entity${i}:x`);
      }
      clearKeyframeCache();
    });

    bench('Cache clear performance', () => {
      // Fill cache
      for (let i = 0; i < 1000; i++) {
        findActiveKeyframe(mediumTrack, 2500, `entity${i}:x`);
      }
      // Clear all
      clearKeyframeCache();
    });

    bench('Selective cache clear', () => {
      // Fill cache
      for (let i = 0; i < 100; i++) {
        findActiveKeyframe(mediumTrack, 2500, `entity${i}:x`);
      }
      // Clear specific keys
      for (let i = 0; i < 50; i++) {
        clearKeyframeCache(`entity${i}:x`);
      }
      clearKeyframeCache();
    });
  });

  describe('Validation', () => {
    bench('Track sorting validation', () => {
      isTrackSorted(largeTrack);
    });

    bench('Track sorting validation (unsorted)', () => {
      const unsorted = [...largeTrack].reverse();
      isTrackSorted(unsorted);
    });
  });
});

describe('Keyframe Search - Comparison with Naive Approach', () => {
  let track: Keyframe[];

  beforeEach(() => {
    track = Array.from({ length: 100 }, (_, i) => ({
      startTime: i * 100,
      time: (i + 1) * 100,
      startValue: i,
      endValue: i + 1,
      easing: 'linear' as const,
    }));
  });

  // Naive linear search (always O(n))
  function naiveLinearSearch(track: Keyframe[], time: number): Keyframe | undefined {
    for (let i = 0; i < track.length; i++) {
      const kf = track[i];
      if (time >= kf.startTime && time <= kf.time) {
        return kf;
      }
    }
    return undefined;
  }

  bench('Naive approach: Linear search (100 keyframes)', () => {
    naiveLinearSearch(track, 5050);
  });

  bench('Optimized approach: Binary search (100 keyframes)', () => {
    findActiveKeyframe(track, 5050);
  });

  bench('Naive approach: Sequential playback', () => {
    for (let i = 0; i < 100; i++) {
      naiveLinearSearch(track, i * 100 + 50);
    }
  });

  bench('Optimized approach: Sequential playback with cache', () => {
    for (let i = 0; i < 100; i++) {
      findActiveKeyframe(track, i * 100 + 50, 'comparison:x');
    }
    clearKeyframeCache();
  });
});
