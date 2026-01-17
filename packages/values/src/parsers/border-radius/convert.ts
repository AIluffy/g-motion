/**
 * Border Radius Unit Conversion
 *
 * Functions for converting between different units in border-radius values.
 *
 * @module values/parsers/border-radius/convert
 */

import type { UnitValue } from '../unit';
import type { BorderRadiusContext } from './types';

/**
 * Convert a unit value to pixels
 */
export function convertToPixels(value: UnitValue, context: BorderRadiusContext = {}): UnitValue {
  const { elementWidth = 100, fontSize = 16, rootFontSize = 16 } = context;

  switch (value.unit) {
    case 'px':
      return value;
    case '%':
      // For border-radius, % is relative to the element's width and height
      // We'll use width as the reference for simplicity
      return {
        value: (value.value / 100) * elementWidth,
        unit: 'px',
      };
    case 'em':
      return {
        value: value.value * fontSize,
        unit: 'px',
      };
    case 'rem':
      return {
        value: value.value * rootFontSize,
        unit: 'px',
      };
    default:
      // For unsupported units, return as-is
      return value;
  }
}

/**
 * Convert unit values to a common unit for interpolation
 */
export function normalizeUnits(
  from: UnitValue,
  to: UnitValue,
  context: BorderRadiusContext = {},
): [UnitValue, UnitValue] {
  // If units are the same, no conversion needed
  if (from.unit === to.unit) {
    return [from, to];
  }

  // Convert both to pixels for interpolation
  const fromPx = convertToPixels(from, context);
  const toPx = convertToPixels(to, context);

  return [fromPx, toPx];
}
