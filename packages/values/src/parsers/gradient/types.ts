/**
 * Gradient Types and Interfaces
 *
 * Type definitions for CSS gradient values and color stops.
 *
 * @module values/parsers/gradient/types
 */

import type { ColorValue } from '../color';

/**
 * Gradient color stop
 */
export interface GradientStop {
  /** Color at this stop */
  color: ColorValue;
  /** Position as percentage (0-100), undefined for auto-positioned stops */
  position?: number;
}

/**
 * Gradient type
 */
export type GradientType = 'linear' | 'radial' | 'conic';

/**
 * Radial gradient shape
 */
export type RadialShape = 'circle' | 'ellipse';

/**
 * Radial gradient size keyword
 */
export type RadialSize = 'closest-side' | 'closest-corner' | 'farthest-side' | 'farthest-corner';

/**
 * Position value (can be percentage, pixel, or keyword)
 */
export interface PositionValue {
  x: number | string;
  y: number | string;
}

/**
 * Gradient value representation
 */
export interface GradientValue {
  /** Type of gradient */
  type: GradientType;
  /** Angle in degrees (for linear gradients) */
  angle?: number;
  /** Shape (for radial gradients) */
  shape?: RadialShape;
  /** Size keyword (for radial gradients) */
  size?: RadialSize;
  /** Center position (for radial and conic gradients) */
  position?: PositionValue;
  /** Starting angle in degrees (for conic gradients) */
  fromAngle?: number;
  /** Color stops */
  stops: GradientStop[];
  /** Whether this is a repeating gradient */
  repeating?: boolean;
}
