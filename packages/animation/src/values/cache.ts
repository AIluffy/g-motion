/**
 * Value Cache with LRU Strategy
 *
 * Caches parsed values to avoid repeated parsing of the same values.
 * Uses a Least Recently Used (LRU) eviction strategy to manage memory.
 *
 * @module values/cache
 */

import { ParsedValue } from './types';

/**
 * LRU Cache entry with access tracking
 */
interface CacheEntry {
  value: ParsedValue;
  lastAccess: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of entries */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Hit rate (0-1) */
  hitRate: number;
}

/**
 * Cache for parsed values to avoid repeated parsing
 *
 * Implements LRU (Least Recently Used) eviction strategy to manage
 * memory usage while keeping frequently accessed values cached.
 */
export class ValueCache {
  /** Internal cache storage */
  private cache: Map<string, CacheEntry> = new Map();

  /** Maximum number of entries */
  private maxSize: number;

  /** Cache hit counter */
  private hits = 0;

  /** Cache miss counter */
  private misses = 0;

  /** Access counter for LRU tracking */
  private accessCounter = 0;

  /**
   * Create a new ValueCache
   *
   * @param maxSize - Maximum number of entries (default: 1000)
   */
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached parsed value
   *
   * @param key - The cache key
   * @returns The cached value or undefined if not found
   */
  get(key: string): ParsedValue | undefined {
    const entry = this.cache.get(key);

    if (entry) {
      // Update access time for LRU
      entry.lastAccess = ++this.accessCounter;
      this.hits++;
      return entry.value;
    }

    this.misses++;
    return undefined;
  }

  /**
   * Set cached parsed value
   *
   * @param key - The cache key
   * @param value - The parsed value to cache
   */
  set(key: string, value: ParsedValue): void {
    // Check if we need to evict
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      lastAccess: ++this.accessCounter,
    });
  }

  /**
   * Check if a key exists in the cache
   *
   * @param key - The cache key
   * @returns true if the key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a specific entry
   *
   * @param key - The cache key
   * @returns true if an entry was deleted
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Generate cache key from value
   *
   * Creates a unique key based on the value's string representation.
   * For complex objects, uses JSON serialization.
   *
   * @param value - The value to generate a key for
   * @returns The generated cache key
   */
  generateKey(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    const type = typeof value;

    if (type === 'string') {
      return `s:${value}`;
    }

    if (type === 'number') {
      return `n:${value}`;
    }

    if (type === 'boolean') {
      return `b:${value}`;
    }

    if (Array.isArray(value)) {
      return `a:${JSON.stringify(value)}`;
    }

    if (type === 'object') {
      try {
        return `o:${JSON.stringify(value)}`;
      } catch {
        // Circular reference or non-serializable
        return `o:${Object.prototype.toString.call(value)}`;
      }
    }

    return `u:${String(value)}`;
  }

  /**
   * Get or compute a cached value
   *
   * If the value is cached, returns it. Otherwise, computes the value
   * using the provided function and caches the result.
   *
   * @param key - The cache key
   * @param compute - Function to compute the value if not cached
   * @returns The cached or computed value
   */
  getOrCompute(key: string, compute: () => ParsedValue): ParsedValue {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = compute();
    this.set(key, value);
    return value;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.accessCounter = 0;
  }

  /**
   * Get cache statistics
   *
   * @returns Current cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Resize the cache
   *
   * If the new size is smaller than current entries, evicts LRU entries.
   *
   * @param newMaxSize - The new maximum size
   */
  resize(newMaxSize: number): void {
    this.maxSize = newMaxSize;

    // Evict entries if necessary
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Get all cached keys
   *
   * @returns Array of cached keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Default global cache instance
 */
export const defaultCache = new ValueCache();
