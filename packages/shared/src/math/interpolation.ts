/**
 * Math utility functions for interpolation and value manipulation
 */

/**
 * Linear interpolation between two numbers
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamps a value between min and max (inclusive)
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamps a value to the range [0, 1]
 */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
