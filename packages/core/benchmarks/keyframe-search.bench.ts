import { describe, bench } from 'vitest';
import { Keyframe, Track } from '@g-motion/shared';
import { findActiveKeyframe } from '../src/components/timeline';

describe('Keyframe Search Performance', () => {
  // Create a track with sorted keyframes
  const createTrack = (keyframeCount: number): Track => {
    const track: Keyframe[] = [];
    for (let i = 0; i < keyframeCount; i++) {
      track.push({
        startTime: i * 100,
        time: (i + 1) * 100,
        startValue: i * 10,
        endValue: (i + 1) * 10,
        easing: (t: number) => t, // linear
      });
    }
    return track;
  };

  // Old implementation: linear search
  const linearSearchKeyframe = (track: Track, t: number): Keyframe | undefined => {
    for (const kf of track) {
      if (t >= kf.startTime && t <= kf.time) {
        return kf;
      }
    }
    // Hold final value
    if (track.length > 0) {
      const last = track[track.length - 1];
      if (t >= last.time) return last;
    }
    return undefined;
  };

  bench('Binary search keyframe lookup (optimized)', () => {
    const track = createTrack(20);
    // Simulate per-frame lookups for typical animation
    for (let frame = 0; frame < 1000; frame++) {
      const t = (frame * 16.67) % 2000; // 60fps simulation
      const kf = findActiveKeyframe(track, t);
      if (!kf) {
        throw new Error('Keyframe not found');
      }
    }
  });

  bench('Linear search keyframe lookup (baseline - old behavior)', () => {
    const track = createTrack(20);
    // Simulate per-frame lookups for typical animation
    for (let frame = 0; frame < 1000; frame++) {
      const t = (frame * 16.67) % 2000; // 60fps simulation
      const kf = linearSearchKeyframe(track, t);
      if (!kf) {
        throw new Error('Keyframe not found');
      }
    }
  });

  bench('Binary search - complex animation (100 keyframes)', () => {
    const track = createTrack(100);
    // Long animation with many keyframes
    for (let frame = 0; frame < 1000; frame++) {
      const t = (frame * 16.67) % 10000; // Longer duration
      findActiveKeyframe(track, t);
    }
  });

  bench('Linear search - complex animation (100 keyframes)', () => {
    const track = createTrack(100);
    // Long animation with many keyframes
    for (let frame = 0; frame < 1000; frame++) {
      const t = (frame * 16.67) % 10000; // Longer duration
      linearSearchKeyframe(track, t);
    }
  });

  bench('High frequency multi-track lookup (50 tracks, 1000 frames)', () => {
    const tracks = Array.from({ length: 50 }, () => createTrack(15));

    for (let frame = 0; frame < 1000; frame++) {
      const t = (frame * 16.67) % 1500;
      for (const track of tracks) {
        findActiveKeyframe(track, t);
      }
    }
  });

  bench('Stress test - many keyframes and lookups', () => {
    const tracks = Array.from({ length: 100 }, () => createTrack(50));

    for (let frame = 0; frame < 500; frame++) {
      const t = (frame * 16.67) % 5000;
      for (const track of tracks) {
        findActiveKeyframe(track, t);
      }
    }
  });

  bench('Random time access pattern (cache miss simulation)', () => {
    const track = createTrack(30);

    for (let i = 0; i < 10000; i++) {
      const randomTime = Math.random() * 3000;
      findActiveKeyframe(track, randomTime);
    }
  });

  bench('Sequential time access pattern (cache friendly)', () => {
    const track = createTrack(30);

    for (let t = 0; t < 3000; t += 10) {
      findActiveKeyframe(track, t);
    }
  });
});
