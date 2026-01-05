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

export function createDebugger(namespace: string) {
  const prefix = `[Motion ${namespace}]`;

  return (...args: unknown[]) => {
    const enabled = !isProd() || getGlobalDebugFlag();
    if (!enabled) return;

    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug(prefix, ...args);
    }
  };
}

// Convenience default debugger for quick use
export const debug = createDebugger('Core');

export * from './targetResolver';
export * from './time/frameSampler';
export * from './math/rollingAverage';
export * from './packedStream';
