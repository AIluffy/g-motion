/**
 * GPU-Only Easing Registry
 *
 * Easing functions are identified by string names and assigned integer IDs (0-30)
 * for use in GPU shaders. Custom easings get IDs starting from 100 by default.
 *
 * This module exports both the EasingRegistry class and convenience functions
 * that proxy to a global default instance for backward compatibility.
 */

import { panic } from '../error';
import { EasingRegistry, EasingEntry } from './easing-registry';

export { EasingRegistry, type EasingEntry };

/**
 * Global default easing registry instance
 */
export const globalEasingRegistry = new EasingRegistry();

/**
 * Get the easing ID for a given easing name.
 *
 * @param name - Easing name (built-in, alias, or custom)
 * @returns Easing ID (0-30 for built-in, 31+ for custom)
 */
export function getEasingId(name?: string): number {
  return globalEasingRegistry.getId(name ?? '');
}

/**
 * Register a custom WGSL easing function.
 *
 * @param wgslFn - Full WGSL function definition (e.g., 'fn myEase(t: f32) -> f32 { return t * t; }')
 * @returns The registered easing name (extracted from WGSL)
 * @deprecated Use registerGpuEasing(name, wgslCode) instead
 */
export function registerGpuEasing(wgslFn: string): string;
/**
 * Register a custom WGSL easing function.
 *
 * @param name - Name for the easing function
 * @param wgslCode - WGSL function code
 * @returns The registered easing entry
 */
export function registerGpuEasing(name: string, wgslCode: string): EasingEntry;
export function registerGpuEasing(nameOrWgsl: string, wgslCode?: string): string | EasingEntry {
  if (wgslCode !== undefined) {
    // New API: registerGpuEasing(name, wgslCode)
    return globalEasingRegistry.register(nameOrWgsl, wgslCode);
  }
  // Legacy API: registerGpuEasing(wgslFn) - extract name from code
  const wgslFn = nameOrWgsl;
  const match = wgslFn.match(/fn\s+(\w+)\s*\(/);
  if (!match) {
    panic(
      'Invalid WGSL easing: missing function declaration (expected: fn name(t: f32) -> f32 { ... })',
      { wgslFn },
    );
  }
  const name = match[1];
  globalEasingRegistry.register(name, wgslFn);
  return name;
}

/**
 * Get the current version of custom easings (increments on each registration).
 *
 * @returns Current version number
 */
export function getCustomEasingVersion(): number {
  return globalEasingRegistry.version;
}

/**
 * Get all registered custom easings for shader injection.
 *
 * @returns Array of custom easing entries
 */
export function getCustomGpuEasings(): ReadonlyArray<{ name: string; wgslFn: string; id: number }> {
  return globalEasingRegistry.getCustomGpuEasings();
}

/**
 * Clear all custom easings and reset state.
 *
 * @deprecated Use globalEasingRegistry.reset() instead
 */
export function __resetCustomEasings(): void {
  globalEasingRegistry.reset();
}
