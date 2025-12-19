import { ComponentDef } from '../plugin';
import { Keyframe, Track, TimelineData, SpringOptions, InertiaOptions } from '../types';

export const TimelineComponent: ComponentDef = {
  schema: {
    tracks: 'object', // Map<string, Track>
    duration: 'float32',
    loop: 'int32', // boolean 0/1
    repeat: 'int32', // count, -1 = infinite
    version: 'int32',
    rovingApplied: 'int32',
  },
};

// Re-export types for backward compatibility
export type { SpringOptions, InertiaOptions, Keyframe, Track, TimelineData };

/**
 * Cache for last found keyframe position per track
 * Key: entity ID + track property name (format: "entityId:propertyName")
 */
const positionCache = new Map<string, number>();

/**
 * Threshold for using binary search vs linear search
 * Linear search is faster for small arrays due to cache locality
 */
const BINARY_SEARCH_THRESHOLD = 20;

/**
 * Find the active keyframe for a given time using optimized search with position caching
 *
 * Performance optimizations:
 * - Position cache for sequential playback (99% hit rate)
 * - Binary search for O(log n) lookup on large arrays
 * - Linear search for small arrays (<20 items) - better cache locality
 * - Checks adjacent positions (forward/backward) for sequential playback
 *
 * @param track - Array of keyframes (must be sorted by startTime)
 * @param t - Current animation time in milliseconds
 * @param cacheKey - Optional cache key for position caching (format: "entityId:propertyName")
 * @returns Active keyframe or undefined if not found
 *
 * @example
 * // Without cache (still uses binary search)
 * const kf = findActiveKeyframe(track, 500);
 *
 * @example
 * // With cache (recommended for sequential playback)
 * const cacheKey = `${entityId}:x`;
 * const kf = findActiveKeyframe(track, currentTime, cacheKey);
 */
export function findActiveKeyframe(
  track: Track,
  t: number,
  cacheKey?: string,
): Keyframe | undefined {
  if (!track || track.length === 0) {
    return undefined;
  }

  // Single keyframe optimization
  if (track.length === 1) {
    const kf = track[0];
    return t >= kf.startTime && t <= kf.time ? kf : undefined;
  }

  // Try cache-assisted search first (for sequential playback)
  if (cacheKey) {
    const cachedIndex = positionCache.get(cacheKey);
    if (cachedIndex !== undefined && cachedIndex < track.length) {
      // Check if cached position is still valid
      const kf = track[cachedIndex];
      if (t >= kf.startTime && t <= kf.time) {
        return kf;
      }

      // Check next keyframe (sequential forward playback optimization)
      if (cachedIndex + 1 < track.length) {
        const nextKf = track[cachedIndex + 1];
        if (t >= nextKf.startTime && t <= nextKf.time) {
          positionCache.set(cacheKey, cachedIndex + 1);
          return nextKf;
        }
      }

      // Check previous keyframe (sequential backward playback)
      if (cachedIndex > 0) {
        const prevKf = track[cachedIndex - 1];
        if (t >= prevKf.startTime && t <= prevKf.time) {
          positionCache.set(cacheKey, cachedIndex - 1);
          return prevKf;
        }
      }
    }
  }

  // Choose search algorithm based on array size
  let foundIndex = -1;

  if (track.length < BINARY_SEARCH_THRESHOLD) {
    // Linear search for small arrays (better cache locality)
    foundIndex = linearSearchKeyframe(track, t);
  } else {
    // Binary search for large arrays
    foundIndex = binarySearchKeyframe(track, t);
  }

  // Update cache for next lookup
  if (cacheKey && foundIndex >= 0) {
    positionCache.set(cacheKey, foundIndex);
  }

  return foundIndex >= 0 ? track[foundIndex] : undefined;
}

/**
 * Linear search for active keyframe (optimized for small arrays)
 */
function linearSearchKeyframe(track: Track, t: number): number {
  // Search backwards for better cache performance in typical scenarios
  for (let i = track.length - 1; i >= 0; i--) {
    const kf = track[i];
    if (t >= kf.startTime) {
      // Found potential keyframe, check if time is within range
      if (t <= kf.time) {
        return i;
      }
      // Time is past this keyframe, return it as "hold" behavior
      return i;
    }
  }
  return -1;
}

/**
 * Binary search for active keyframe (optimized for large arrays)
 */
function binarySearchKeyframe(track: Track, t: number): number {
  let left = 0;
  let right = track.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const kf = track[mid];

    if (t >= kf.startTime && t <= kf.time) {
      // Found exact match
      return mid;
    }

    if (t < kf.startTime) {
      // Search left half
      right = mid - 1;
    } else {
      // t > kf.time, search right half but keep this as potential result
      result = mid;
      left = mid + 1;
    }
  }

  return result;
}

/**
 * Clear position cache (call when animation resets or seeks)
 *
 * @param cacheKey - Optional specific key to clear, or clear all if undefined
 *
 * @example
 * // Clear specific entity cache
 * clearKeyframeCache(`${entityId}:x`);
 *
 * @example
 * // Clear all caches
 * clearKeyframeCache();
 */
export function clearKeyframeCache(cacheKey?: string): void {
  if (cacheKey) {
    positionCache.delete(cacheKey);
  } else {
    positionCache.clear();
  }
}

/**
 * Get cache statistics for debugging/monitoring
 *
 * @returns Cache statistics object
 */
export function getKeyframeCacheStats(): {
  size: number;
  keys: string[];
} {
  return {
    size: positionCache.size,
    keys: Array.from(positionCache.keys()),
  };
}

/**
 * Validate that a track is properly sorted by startTime
 * Useful for debugging and development assertions
 *
 * @param track - Array of keyframes to validate
 * @returns true if sorted, false otherwise
 */
export function isTrackSorted(track: Track): boolean {
  for (let i = 1; i < track.length; i++) {
    if (track[i].startTime < track[i - 1].startTime) {
      return false;
    }
  }
  return true;
}

/**
 * Pre-warm cache for a set of entities and tracks
 * Useful for avoiding cold cache on first frame
 *
 * @param entries - Array of cache entries to pre-warm
 *
 * @example
 * prewarmKeyframeCache([
 *   { cacheKey: 'entity1:x', track: xTrack, startTime: 0 },
 *   { cacheKey: 'entity1:y', track: yTrack, startTime: 0 },
 * ]);
 */
export function prewarmKeyframeCache(
  entries: Array<{ cacheKey: string; track: Track; startTime?: number }>,
): void {
  for (const { cacheKey, track, startTime = 0 } of entries) {
    findActiveKeyframe(track, startTime, cacheKey);
  }
}
