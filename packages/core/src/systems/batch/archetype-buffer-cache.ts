/**
 * Archetype Buffer Cache
 *
 * P1-2 Optimization: Caches frequently accessed buffers at the archetype level
 * to avoid repeated Map lookups in hot paths.
 *
 * Performance benefits:
 * - Reduces Map.get() calls from 8 × 50 archetypes = 400/frame to 1/frame per archetype
 * - Improves cache locality by grouping related buffers
 * - Eliminates redundant buffer lookups in BatchSamplingSystem
 *
 * Expected savings: 0.3-0.5ms/frame CPU overhead
 */

export interface CachedArchetypeBuffers {
  // Component buffers
  stateBuffer: Array<unknown> | undefined;
  timelineBuffer: Array<unknown> | undefined;
  renderBuffer: Array<unknown> | undefined;
  springBuffer: Array<unknown> | undefined;
  inertiaBuffer: Array<unknown> | undefined;

  // Typed buffers (SoA)
  typedStatus: Float32Array | Float64Array | Int32Array | undefined;
  typedStartTime: Float32Array | Float64Array | Int32Array | undefined;
  typedCurrentTime: Float32Array | Float64Array | Int32Array | undefined;
  typedPlaybackRate: Float32Array | Float64Array | Int32Array | undefined;
  typedIteration: Float32Array | Float64Array | Int32Array | undefined;
  typedTickInterval: Float32Array | Float64Array | Int32Array | undefined;
  typedTickPhase: Float32Array | Float64Array | Int32Array | undefined;
  typedRendererCode: Float32Array | Float64Array | Int32Array | undefined;
  typedTimelineVersion: Float32Array | Float64Array | Int32Array | undefined;

  // Cache metadata
  archetypeVersion: number; // Invalidate cache when archetype changes
  lastAccessFrame: number;
}

import type { Archetype } from '../../archetype';

/**
 * Archetype Buffer Cache Manager
 *
 * Maintains a cache of frequently accessed buffers per archetype.
 * Automatically invalidates cache when archetype structure changes.
 */
export class ArchetypeBufferCache {
  private cache = new Map<string, CachedArchetypeBuffers>();
  private currentFrame = 0;
  private readonly maxCacheAge = 300; // Frames (~5 seconds at 60fps)

  /**
   * Get cached buffers for an archetype
   *
   * @param archetype - Archetype to get buffers for
   * @returns Cached buffers or undefined if cache miss
   */
  getBuffers(archetype: Archetype): CachedArchetypeBuffers | undefined {
    const cached = this.cache.get(archetype.id);

    // Cache hit: validate version
    if (cached) {
      // Check if archetype structure changed (entities added/removed)
      const currentVersion = archetype.entityCount; // Simple version: entity count
      if (cached.archetypeVersion === currentVersion) {
        cached.lastAccessFrame = this.currentFrame;
        return cached;
      }

      // Cache invalidated: archetype changed
      this.cache.delete(archetype.id);
    }

    return undefined;
  }

  /**
   * Store buffers in cache
   *
   * @param archetype - Archetype to cache buffers for
   * @param buffers - Buffers to cache
   */
  setBuffers(
    archetype: Archetype,
    buffers: Omit<CachedArchetypeBuffers, 'archetypeVersion' | 'lastAccessFrame'>,
  ): void {
    const cached: CachedArchetypeBuffers = {
      ...buffers,
      archetypeVersion: archetype.entityCount,
      lastAccessFrame: this.currentFrame,
    };

    this.cache.set(archetype.id, cached);
  }

  /**
   * Advance frame counter and clean up stale cache entries
   */
  nextFrame(): void {
    this.currentFrame++;

    // Periodic cleanup: remove stale entries
    if (this.currentFrame % 60 === 0) {
      const toRemove: string[] = [];

      for (const [key, cached] of this.cache.entries()) {
        const age = this.currentFrame - cached.lastAccessFrame;
        if (age > this.maxCacheAge) {
          toRemove.push(key);
        }
      }

      for (const key of toRemove) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached buffers
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cacheSize: number;
    currentFrame: number;
  } {
    return {
      cacheSize: this.cache.size,
      currentFrame: this.currentFrame,
    };
  }
}

/**
 * Singleton instance for global access
 */
let globalArchetypeBufferCache: ArchetypeBufferCache | null = null;

export function getArchetypeBufferCache(): ArchetypeBufferCache {
  if (!globalArchetypeBufferCache) {
    globalArchetypeBufferCache = new ArchetypeBufferCache();
  }
  return globalArchetypeBufferCache;
}

export function resetArchetypeBufferCache(): void {
  if (globalArchetypeBufferCache) {
    globalArchetypeBufferCache.clear();
    globalArchetypeBufferCache = null;
  }
}
