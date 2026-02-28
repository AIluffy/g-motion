/**
 * Border Radius Types and Interfaces
 *
 * Type definitions for border-radius values and corners.
 *
 * @module values/parsers/border-radius/types
 */

import type { UnitValue } from '../unit';

/**
 * Border radius corner representation
 */
export interface BorderRadiusCorner {
  /** Horizontal radius */
  horizontal: UnitValue;
  /** Vertical radius (same as horizontal if not specified) */
  vertical: UnitValue;
}

/**
 * Border radius value representation
 */
export interface BorderRadiusValue {
  /** Top-left corner */
  topLeft: BorderRadiusCorner;
  /** Top-right corner */
  topRight: BorderRadiusCorner;
  /** Bottom-right corner */
  bottomRight: BorderRadiusCorner;
  /** Bottom-left corner */
  bottomLeft: BorderRadiusCorner;
}

/**
 * Unit conversion context for border-radius
 */
export interface BorderRadiusContext {
  /** Element width for percentage conversion */
  elementWidth?: number;
  /** Element height for percentage conversion */
  elementHeight?: number;
  /** Font size for em/rem conversion */
  fontSize?: number;
  /** Root font size for rem conversion */
  rootFontSize?: number;
}
