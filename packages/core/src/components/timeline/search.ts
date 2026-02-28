import { Keyframe, Track } from '@g-motion/shared';
import { linearSearchKeyframe, binarySearchKeyframe } from './search-algorithms';
import { positionCache } from './cache-map';

const BINARY_SEARCH_THRESHOLD = 20;

export function findActiveKeyframe(track: Track, t: number): Keyframe | undefined {
  if (!track || track.length === 0) {
    return undefined;
  }

  if (track.length === 1) {
    const kf = track[0];
    return t >= kf.startTime && t <= kf.time ? kf : undefined;
  }

  let foundIndex = -1;

  if (track.length < BINARY_SEARCH_THRESHOLD) {
    foundIndex = linearSearchKeyframe(track, t);
  } else {
    foundIndex = binarySearchKeyframe(track, t);
  }

  return foundIndex >= 0 ? track[foundIndex] : undefined;
}

export function findActiveKeyframeCached(
  track: Track,
  t: number,
  cacheKey: string,
): Keyframe | undefined {
  if (!track || track.length === 0) {
    return undefined;
  }

  if (track.length === 1) {
    const kf = track[0];
    if (t >= kf.startTime && t <= kf.time) {
      positionCache.set(cacheKey, 0);
      return kf;
    }
    return undefined;
  }

  const cachedIndex = positionCache.get(cacheKey);
  if (cachedIndex !== undefined && cachedIndex < track.length) {
    const kf = track[cachedIndex];
    if (t >= kf.startTime && t <= kf.time) {
      return kf;
    }

    if (cachedIndex + 1 < track.length) {
      const nextKf = track[cachedIndex + 1];
      if (t >= nextKf.startTime && t <= nextKf.time) {
        positionCache.set(cacheKey, cachedIndex + 1);
        return nextKf;
      }
    }

    if (cachedIndex > 0) {
      const prevKf = track[cachedIndex - 1];
      if (t >= prevKf.startTime && t <= prevKf.time) {
        positionCache.set(cacheKey, cachedIndex - 1);
        return prevKf;
      }
    }
  }

  let foundIndex = -1;

  if (track.length < BINARY_SEARCH_THRESHOLD) {
    foundIndex = linearSearchKeyframe(track, t);
  } else {
    foundIndex = binarySearchKeyframe(track, t);
  }

  if (foundIndex >= 0) {
    positionCache.set(cacheKey, foundIndex);
  }

  return foundIndex >= 0 ? track[foundIndex] : undefined;
}

export function isTrackSorted(track: Track): boolean {
  for (let i = 1; i < track.length; i++) {
    if (track[i].startTime < track[i - 1].startTime) {
      return false;
    }
  }
  return true;
}
