/**
 * DebugController - Debug Logging and Threshold Management
 *
 * A class-based controller for managing debug logging with configurable thresholds,
 * namespace-based loggers, and environment-based configuration.
 */

/**
 * Debug level type
 */
export type DebugLevel = 'none' | 'error' | 'warn' | 'info' | 'verbose';

/**
 * Level order for comparison (higher number = more verbose)
 */
const LEVEL_ORDER: Record<DebugLevel, number> = {
  none: 0,
  error: 10,
  warn: 20,
  info: 30,
  verbose: 40,
};

/**
 * Debug environment interface for dependency injection
 *
 * Allows tests to inject mock environment instead of using browser APIs
 */
export interface DebugEnvironment {
  /** Get global debug level from globalThis */
  getGlobalLevel?: () => DebugLevel | undefined;
  /** Get debug flag from storage (e.g., localStorage) */
  getStorageFlag?: () => string | undefined;
  /** Get debug flag from URL (e.g., URLSearchParams) */
  getUrlFlag?: () => string | undefined;
}

/**
 * Default debug environment using browser APIs
 *
 * All browser API calls are wrapped in try-catch to handle environments
 * where these APIs may not be available (e.g., SSR, Web Workers)
 */
export const defaultDebugEnv: DebugEnvironment = {
  getGlobalLevel: (): DebugLevel | undefined => {
    try {
      if (typeof globalThis === 'undefined') return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const level = (globalThis as any).__MOTION_DEBUG_LEVEL__;
      if (
        level === 'none' ||
        level === 'error' ||
        level === 'warn' ||
        level === 'info' ||
        level === 'verbose'
      ) {
        return level;
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  },

  getStorageFlag: (): string | undefined => {
    try {
      if (typeof localStorage === 'undefined') return undefined;
      return localStorage.getItem('motion_debug') ?? undefined;
    } catch {
      // localStorage not available or access denied
      return undefined;
    }
  },

  getUrlFlag: (): string | undefined => {
    try {
      if (typeof window === 'undefined' || typeof location === 'undefined') return undefined;
      const params = new URLSearchParams(window.location.search);
      return params.get('motion_debug') ?? undefined;
    } catch {
      // URL API not available
      return undefined;
    }
  },
};

/**
 * Check if current environment is production
 */
function isProd(): boolean {
  try {
    if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
      return process.env.NODE_ENV === 'production';
    }
  } catch {
    // process not available
  }
  return false;
}

/**
 * DebugController class for managing debug logging
 *
 * This class encapsulates all debug-related state and provides methods
 * for creating namespaced loggers and checking log levels.
 *
 * @example
 * ```typescript
 * const debug = new DebugController();
 * const logger = debug.createDebugger('MyComponent', 'info');
 * logger('This is an info message');
 *
 * // In tests, inject mock environment:
 * const testDebug = new DebugController({
 *   getGlobalLevel: () => 'verbose'
 * });
 * ```
 */
export class DebugController {
  /** Cache of created debugger functions */
  private _cache: Map<string, (...args: unknown[]) => void>;
  /** Cached threshold value (null = not computed yet) */
  private _cachedThreshold: DebugLevel | null;
  /** Debug environment for configuration */
  private _env: DebugEnvironment;

  /**
   * Creates a new DebugController instance
   * @param env - Debug environment for configuration (default: defaultDebugEnv)
   */
  constructor(env: DebugEnvironment = defaultDebugEnv) {
    this._cache = new Map();
    this._cachedThreshold = null;
    this._env = env;
  }

  /**
   * Compute the debug threshold from environment
   *
   * Priority:
   * 1. Global level (__MOTION_DEBUG_LEVEL__)
   * 2. URL flag (?motion_debug=true)
   * 3. Storage flag (localStorage.motion_debug)
   * 4. Environment default (warn in prod, verbose in dev)
   */
  private computeThreshold(): DebugLevel {
    const globalLevel = this._env.getGlobalLevel?.();
    if (globalLevel) {
      return globalLevel;
    }

    const urlFlag = this._env.getUrlFlag?.();
    const storageFlag = this._env.getStorageFlag?.();
    const hasDebugFlag = urlFlag === 'true' || urlFlag === '1' || storageFlag === 'true';

    if (hasDebugFlag) {
      return 'verbose';
    }

    return isProd() ? 'warn' : 'verbose';
  }

  /**
   * Get the debug threshold (cached on first call)
   *
   * @returns The current debug threshold level
   */
  getThreshold(): DebugLevel {
    if (this._cachedThreshold === null) {
      this._cachedThreshold = this.computeThreshold();
    }
    return this._cachedThreshold;
  }

  /**
   * Invalidate the cached threshold
   *
   * Call this when dynamically changing debug levels at runtime.
   * The threshold will be re-computed on the next getThreshold() call.
   */
  invalidateThreshold(): void {
    this._cachedThreshold = null;
  }

  /**
   * Check if a message at the given level should be logged
   *
   * The threshold represents the minimum level that should be logged.
   * If threshold is 'warn', then 'warn', 'error' should be logged.
   * If threshold is 'verbose', all levels should be logged.
   *
   * @param level - Debug level to check
   * @returns true if messages at this level should be logged
   */
  shouldLog(level: DebugLevel): boolean {
    const threshold = this.getThreshold();
    // Lower LEVEL_ORDER number = higher priority (more important)
    // e.g., 'error' (10) is more important than 'verbose' (40)
    // A message should be logged if its priority is <= threshold's priority
    return LEVEL_ORDER[level] <= LEVEL_ORDER[threshold];
  }

  /**
   * Create a namespaced debugger function
   *
   * @param namespace - Namespace for the debugger (prepended to log messages)
   * @param level - Minimum level for this debugger (default: 'verbose')
   * @returns Debugger function that logs messages if level is enabled
   */
  createDebugger(namespace: string, level: DebugLevel = 'verbose'): (...args: unknown[]) => void {
    const cacheKey = `${namespace}:${level}`;

    // Return cached debugger if exists
    const cached = this._cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Create new debugger function
    const prefix = `[Motion][${namespace}]`;
    const debuggerFn = (...args: unknown[]): void => {
      if (!this.shouldLog(level)) return;

      const c = typeof console !== 'undefined' ? console : undefined;
      if (!c) return;

      // Map our level to console method
      const consoleMethodMap: Record<DebugLevel, string> = {
        none: 'log',
        error: 'error',
        warn: 'warn',
        info: 'info',
        verbose: 'log',
      };

      const methodName = consoleMethodMap[level];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const consoleFn = (c as any)[methodName];

      if (typeof consoleFn === 'function') {
        consoleFn(prefix, ...args);
      } else if (typeof c.log === 'function') {
        c.log(prefix, ...args);
      }
    };

    // Cache and return
    this._cache.set(cacheKey, debuggerFn);
    return debuggerFn;
  }

  /**
   * Reset the controller state
   *
   * Clears:
   * - All cached debugger functions
   * - Cached threshold value
   */
  reset(): void {
    this._cache.clear();
    this._cachedThreshold = null;
  }

  /**
   * Clear all caches - alias for reset()
   *
   * @deprecated Use reset() instead
   */
  clear(): void {
    this.reset();
  }
}
