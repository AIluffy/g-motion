// Shared debug logger utility
// - No side effects; pure functions for tree-shaking
// - Enabled in non-production by default
// - Can be forced on in production with globalThis.__MOTION_DEBUG__

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

const getGlobalDebugFlag = (): boolean => {
  if (typeof globalThis === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Boolean((globalThis as any).__MOTION_DEBUG__);
};

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<DebugLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const getGlobalDebugLevel = (): DebugLevel | null => {
  if (typeof globalThis === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const level = (globalThis as any).__MOTION_DEBUG_LEVEL__;
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  return null;
};

function shouldLog(level: DebugLevel): boolean {
  const globalLevel = getGlobalDebugLevel();
  const threshold: DebugLevel =
    globalLevel ?? (getGlobalDebugFlag() ? 'debug' : isProd() ? 'warn' : 'debug');
  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold];
}

export function createDebugger(namespace: string): (...args: unknown[]) => void;
export function createDebugger(namespace: string, level: DebugLevel): (...args: unknown[]) => void;
export function createDebugger(namespace: string, level: DebugLevel = 'debug') {
  const prefix = `[Motion][${namespace}]`;

  return (...args: unknown[]) => {
    if (!shouldLog(level)) return;
    const c = typeof console !== 'undefined' ? console : undefined;
    const fn = c ? (c as unknown as Record<string, (...a: unknown[]) => void>)[level] : undefined;
    if (typeof fn === 'function') {
      fn(prefix, ...args);
      return;
    }
    if (c && typeof c.log === 'function') {
      c.log(prefix, ...args);
    }
  };
}

// Convenience default debugger for quick use
export const debug = createDebugger('Core');

export * from './targetResolver';
export * from './time/frameSampler';
export * from './math/rollingAverage';
export * from './packedStream';
