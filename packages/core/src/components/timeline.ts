import { ComponentDef } from '../plugin';
import { Keyframe, Track, TimelineData, SpringOptions, InertiaOptions } from '../types';

export const TimelineComponent: ComponentDef = {
  schema: {
    tracks: 'object', // Map<string, Track>
    duration: 'float32',
    loop: 'int32', // boolean 0/1
    repeat: 'int32', // count, -1 = infinite
  },
};

// Re-export types for backward compatibility
export type { SpringOptions, InertiaOptions, Keyframe, Track, TimelineData };

/**
 * Binary search to find the active keyframe at time t
 * @param track - Array of keyframes (assumed sorted by startTime)
 * @param t - Current time
 * @returns The active keyframe or undefined if none found
 */
export function findActiveKeyframe(track: Track, t: number): Keyframe | undefined {
  let left = 0;
  let right = track.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const kf = track[mid];

    if (t >= kf.startTime && t <= kf.time) {
      return kf;
    }

    if (t < kf.startTime) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  // If t is past all keyframes, return the last one (hold final value)
  if (track.length > 0 && t >= track[track.length - 1].time) {
    return track[track.length - 1];
  }

  return undefined;
}
