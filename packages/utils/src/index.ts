// Shared debug logger utility
// - No side effects; pure functions for tree-shaking
// - Enabled in non-production by default
// - Can be forced on in production with:
//   - globalThis.__MOTION_DEBUG__ = true
//   - localStorage.setItem('motion_debug', 'true')
//   - URL parameter: ?motion_debug=1

const isProd = (): boolean => {
  if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
    return process.env.NODE_ENV === 'production';
  }
  return false;
};

/**
 * Development environment utilities
 */

/**
 * Checks if the current environment is development mode
 * @returns boolean - true if in development mode
 */
export function isDev(): boolean {
  if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
    return process.env.NODE_ENV === 'development';
  }
  return false;
}

type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<DebugLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Get a global flag from globalThis with type safety
 */
function getGlobalFlag<T>(key: string, defaultValue: T): T {
  if (typeof globalThis === 'undefined') return defaultValue;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (globalThis as any)?.[key];
  return value !== undefined && value !== null ? value : defaultValue;
}

/**
 * Get a global debug level from globalThis
 */
function getGlobalDebugLevel(): DebugLevel | null {
  const level = getGlobalFlag<DebugLevel | null>('__MOTION_DEBUG_LEVEL__', null);
  if (level && (level === 'debug' || level === 'info' || level === 'warn' || level === 'error')) {
    return level;
  }
  return null;
}

/**
 * Check if debug is enabled via URL parameter or localStorage
 * Supports: ?motion_debug=1 or localStorage.motion_debug = 'true'
 */
function getUrlOrStorageDebugFlag(): boolean {
  if (typeof window === 'undefined') return false;

  // Check URL parameter: ?motion_debug=1
  try {
    const url = new URLSearchParams(window.location.search);
    const debugParam = url.get('motion_debug');
    if (debugParam === '1' || debugParam === 'true') {
      return true;
    }
  } catch {
    // URL not available or invalid
  }

  // Check localStorage
  try {
    if (localStorage.getItem('motion_debug') === 'true') {
      return true;
    }
  } catch {
    // localStorage not available
  }

  return false;
}

// Cache for threshold to avoid repeated checks
// We cache based on the computed result, and invalidate when state changes
let _cachedThreshold: DebugLevel | null = null;
let _cacheTime = 0;
const CACHE_TTL = 1000; // 1 second cache for repeated calls within same event loop

/**
 * Get the debug threshold with caching
 * Avoids repeated checks for global flags, URL params, and environment
 */
function getDebugThreshold(): DebugLevel {
  const now = Date.now();
  if (_cachedThreshold !== null && now - _cacheTime < CACHE_TTL) {
    return _cachedThreshold;
  }

  const globalLevel = getGlobalDebugLevel();
  const urlDebug = getUrlOrStorageDebugFlag();
  const globalDebug = getGlobalFlag<boolean>('__MOTION_DEBUG__', false);

  // Priority: globalLevel > urlDebug > globalDebug > environment default
  _cachedThreshold =
    globalLevel ?? (urlDebug || globalDebug ? 'debug' : isProd() ? 'warn' : 'debug');
  _cacheTime = now;
  return _cachedThreshold;
}

function shouldLog(level: DebugLevel): boolean {
  const threshold = getDebugThreshold();
  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold];
}

// Cache for debuggers to avoid creating same function multiple times
const debuggerCache = new Map<string, (...args: unknown[]) => void>();

function getCachedDebugger(namespace: string, level: DebugLevel): (...args: unknown[]) => void {
  const cacheKey = `${namespace}:${level}`;
  const existing = debuggerCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const prefix = `[Motion][${namespace}]`;
  const fn = (...args: unknown[]) => {
    if (!shouldLog(level)) return;
    const c = typeof console !== 'undefined' ? console : undefined;
    const consoleFn = c
      ? (c as unknown as Record<string, (...a: unknown[]) => void>)[level]
      : undefined;
    if (typeof consoleFn === 'function') {
      consoleFn(prefix, ...args);
    } else if (c && typeof c.log === 'function') {
      c.log(prefix, ...args);
    }
  };

  debuggerCache.set(cacheKey, fn);
  return fn;
}

export function createDebugger(namespace: string): (...args: unknown[]) => void;
export function createDebugger(namespace: string, level: DebugLevel): (...args: unknown[]) => void;
export function createDebugger(namespace: string, level: DebugLevel = 'debug') {
  return getCachedDebugger(namespace, level);
}

/**
 * Clear all caches - useful for testing
 */
export function _clearDebuggerCache(): void {
  _cachedThreshold = null;
  _cacheTime = 0;
  debuggerCache.clear();
}

// Convenience default debugger for quick use
export const debug = createDebugger('Core');

// Re-export types for external use
export type { DebugLevel };

export * from './targetResolver';
export * from './time/frameSampler';
export * from './math/rollingAverage';
export * from './math/interpolation';
export * from './dom';
export * from './packedStream';
