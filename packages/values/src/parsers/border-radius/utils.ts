/**
 * Border Radius Parsing Utilities
 *
 * Helper functions for parsing border-radius values.
 *
 * @module values/parsers/border-radius/utils
 */

import { ValueType, ValueParseError } from '../../core/types';
import type { UnitValue } from '../unit';
import { unitParser } from '../unit';

/**
 * Regex patterns for border-radius detection
 */
export const BORDER_RADIUS_PATTERNS = {
  /** Single value: "10px" */
  single: /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?)$/i,
  /** Multiple values: "10px 20px" or "10px 20px 30px 40px" */
  multiple:
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?(?:\s+[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?){1,3})$/i,
  /** Elliptical: "10px / 20px" or "10px 20px / 30px 40px" */
  elliptical:
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?(?:\s+[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?){0,3})\s*\/\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?(?:\s+[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?){0,3})$/i,
};

/**
 * Parse a single radius value (with unit)
 */
export function parseRadiusValue(value: string): UnitValue {
  const trimmed = value.trim();

  // Try to parse as unit value first
  if (unitParser.detect(trimmed)) {
    const parsed = unitParser.parse(trimmed);
    return parsed.value;
  }

  // If no unit, assume pixels
  const numericValue = parseFloat(trimmed);
  if (Number.isNaN(numericValue)) {
    throw new ValueParseError(value, ValueType.Unit, 'Invalid numeric value');
  }

  return {
    value: numericValue,
    unit: 'px',
  };
}

/**
 * Parse multiple radius values from a space-separated string
 */
export function parseRadiusValues(valuesStr: string): UnitValue[] {
  const values = valuesStr.trim().split(/\s+/);
  return values.map(parseRadiusValue);
}

/**
 * Expand radius values to 4 corners following CSS rules
 */
export function expandRadiusValues(
  values: UnitValue[],
): [UnitValue, UnitValue, UnitValue, UnitValue] {
  switch (values.length) {
    case 1:
      return [values[0], values[0], values[0], values[0]];
    case 2:
      return [values[0], values[1], values[0], values[1]];
    case 3:
      return [values[0], values[1], values[2], values[1]];
    case 4:
      return [values[0], values[1], values[2], values[3]];
    default:
      throw new ValueParseError(values, ValueType.Unit, 'Invalid number of radius values');
  }
}
