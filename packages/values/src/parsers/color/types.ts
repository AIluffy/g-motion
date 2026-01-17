/**
 * Color Types and Interfaces
 *
 * Type definitions for color values and interpolation modes.
 *
 * @module values/parsers/color/types
 */

/**
 * Color representation in RGBA format
 * All components are normalized to standard ranges
 */
export interface ColorValue {
  /** Red channel (0-255) */
  r: number;
  /** Green channel (0-255) */
  g: number;
  /** Blue channel (0-255) */
  b: number;
  /** Alpha channel (0-1) */
  a: number;
}

/**
 * Color interpolation mode
 */
export type ColorInterpolationMode = 'rgb' | 'hsl';
