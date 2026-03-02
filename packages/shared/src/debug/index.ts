/**
 * Debug logging utility
 *
 * Provides namespace-based debug logging with configurable thresholds.
 * Supports environment-based configuration via:
 * - globalThis.__MOTION_DEBUG_LEVEL__ (highest priority)
 * - URL parameter: ?motion_debug=true
 * - localStorage: motion_debug=true
 *
 * This module exports both the DebugController class and convenience functions
 * that proxy to a global default instance for backward compatibility.
 */

import { DebugController, DebugLevel, DebugEnvironment } from './debug-controller';

export { DebugController, type DebugLevel, type DebugEnvironment };

/**
 * @deprecated Use DebugController instead
 */
export const DebugManager = DebugController;

/**
 * Global default debug controller instance
 */
export const globalDebugController = new DebugController();

/**
 * Check if the current environment is development mode
 * @returns true if in development mode
 */
export function isDev(): boolean {
  try {
    if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
      return process.env.NODE_ENV === 'development';
    }
  } catch {
    // process not available
  }
  return false;
}

/**
 * Create a namespaced debugger function
 *
 * @param namespace - Namespace for the debugger (prepended to log messages)
 * @returns Debugger function
 */
export function createDebugger(namespace: string): (...args: unknown[]) => void;
/**
 * Create a namespaced debugger function with specific level
 *
 * @param namespace - Namespace for the debugger
 * @param level - Minimum level for this debugger (default: 'verbose')
 * @returns Debugger function
 */
export function createDebugger(namespace: string, level: DebugLevel): (...args: unknown[]) => void;
export function createDebugger(
  namespace: string,
  level: DebugLevel = 'verbose',
): (...args: unknown[]) => void {
  return globalDebugController.createDebugger(namespace, level);
}

/**
 * Convenience default debugger for quick use
 */
export const debug = createDebugger('Core');

/**
 * Clear all debugger caches
 *
 * @deprecated Use globalDebugController.reset() instead
 */
export function _clearDebuggerCache(): void {
  globalDebugController.reset();
}
