/**
 * GPU-Only Easing Registry
 *
 * Easing functions are identified by string names and assigned integer IDs (0-30)
 * for use in GPU shaders. Custom easings get IDs starting from 31.
 */

import { getErrorHandler } from '../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';

// Built-in easings: name → id (0-30)
const BUILTIN_EASINGS = {
  linear: 0,
  easeInQuad: 1,
  easeOutQuad: 2,
  easeInOutQuad: 3,
  easeInCubic: 4,
  easeOutCubic: 5,
  easeInOutCubic: 6,
  easeInQuart: 7,
  easeOutQuart: 8,
  easeInOutQuart: 9,
  easeInQuint: 10,
  easeOutQuint: 11,
  easeInOutQuint: 12,
  easeInSine: 13,
  easeOutSine: 14,
  easeInOutSine: 15,
  easeInExpo: 16,
  easeOutExpo: 17,
  easeInOutExpo: 18,
  easeInCirc: 19,
  easeOutCirc: 20,
  easeInOutCirc: 21,
  easeInBack: 22,
  easeOutBack: 23,
  easeInOutBack: 24,
  easeInElastic: 25,
  easeOutElastic: 26,
  easeInOutElastic: 27,
  easeInBounce: 28,
  easeOutBounce: 29,
  easeInOutBounce: 30,
} as const;

// Combined lookup: built-in names + aliases → id
// Aliases map to built-in easing IDs
const EASING_TO_ID = {
  ...BUILTIN_EASINGS,
  easeIn: 1,
  easeOut: 2,
  easeInOut: 3,
} as const;

// Custom easings storage
type CustomEasing = { wgslFn: string; id: number };
const customEasings = new Map<string, CustomEasing>();

// ID allocation and versioning
let _nextEasingId = 31; // 0-30 reserved for built-in
let _version = 0;

// Track unknown easings that have been logged (avoid spam)
const _loggedUnknownEasings = new Set<string>();

function _allocateEasingId(): number {
  return _nextEasingId++;
}

function _bumpVersion(): void {
  _version++;
}

function _logUnknownEasingOnce(name: string): void {
  if (_loggedUnknownEasings.has(name)) return;
  _loggedUnknownEasings.add(name);

  const errorHandler = getErrorHandler();
  errorHandler?.handle(
    new MotionError(
      `Unknown easing: '${name}'`,
      ErrorCode.INVALID_EASING,
      ErrorSeverity.INFO, // INFO for diagnostic messages (logged once per name)
      { easingName: name },
    ),
  );
}

/**
 * Get all registered custom easings for shader injection.
 */
export function getCustomGpuEasings(): ReadonlyArray<{ name: string; wgslFn: string; id: number }> {
  const result: Array<{ name: string; wgslFn: string; id: number }> = [];
  for (const [name, { wgslFn, id }] of customEasings) {
    result.push({ name, wgslFn, id });
  }
  return result;
}

/**
 * Get the current version of custom easings (increments on each registration).
 */
export function getCustomEasingVersion(): number {
  return _version;
}

/**
 * Get the easing ID for a given easing name.
 *
 * @param name - Easing name (built-in, alias, or custom)
 * @returns Easing ID (0-30 for built-in, 31+ for custom)
 */
export function getEasingId(name?: string): number {
  if (!name) return 0; // linear

  // Check built-in/alias first (O(1) lookup)
  const builtinId = EASING_TO_ID[name as keyof typeof EASING_TO_ID];
  if (builtinId !== undefined) return builtinId;

  // Check custom easings
  const custom = customEasings.get(name);
  if (custom) return custom.id;

  // Unknown easing - log warning once and fallback to linear
  _logUnknownEasingOnce(name);

  return 0; // Fallback to linear
}

/**
 * Register a custom WGSL easing function.
 *
 * @param wgslFn - Full WGSL function definition (e.g., 'fn myEase(t: f32) -> f32 { return t * t; }')
 * @returns The registered easing name (extracted from WGSL)
 */
export function registerGpuEasing(wgslFn: string): string {
  const match = wgslFn.match(/fn\s+(\w+)\s*\(/);
  if (!match) {
    throw new MotionError(
      'Invalid WGSL easing: missing function declaration (expected: fn name(t: f32) -> f32 { ... })',
      ErrorCode.INVALID_PARAMETER,
      ErrorSeverity.ERROR,
      { wgslFn },
    );
  }

  const name = match[1];
  const existed = customEasings.has(name);

  customEasings.set(name, { wgslFn, id: _allocateEasingId() });

  if (existed) {
    // Log at INFO level - overwriting custom easing may be intentional
    const errorHandler = getErrorHandler();
    errorHandler?.handle(
      new MotionError(
        `Custom easing '${name}' was overwritten`,
        ErrorCode.INVALID_EASING,
        ErrorSeverity.INFO,
        { easingName: name, wgslFn },
      ),
    );
  }

  _bumpVersion();
  return name;
}

/**
 * Reset custom easings for testing purposes.
 */
export function __resetCustomEasings(): void {
  customEasings.clear();
  _nextEasingId = 31;
  _version = 0;
  _loggedUnknownEasings.clear();
}
