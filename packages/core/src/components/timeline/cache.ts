import { Track } from '@g-motion/shared';
import { findActiveKeyframeCached } from './search';
import { positionCache } from './cache-map';

export function clearKeyframeCache(cacheKey?: string): void {
  if (cacheKey) {
    positionCache.delete(cacheKey);
  } else {
    positionCache.clear();
  }
}

export function getKeyframeCacheStats(): {
  size: number;
  keys: string[];
} {
  return {
    size: positionCache.size,
    keys: Array.from(positionCache.keys()),
  };
}

export function prewarmKeyframeCache(
  entries: Array<{ cacheKey: string; track: Track; startTime?: number }>,
): void {
  for (const { cacheKey, track, startTime = 0 } of entries) {
    findActiveKeyframeCached(track, startTime, cacheKey);
  }
}
