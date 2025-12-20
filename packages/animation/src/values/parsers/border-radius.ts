/**
 * Border Radius Value Parser
 *
 * Handles parsing and interpolation of border-radius values:
 * - Single value: "10px" (all corners)
 * - Four values: "10px 20px 30px 40px" (top-left, top-right, bottom-right, bottom-left)
 * - Elliptical: "10px / 20px" (horizontal / vertical)
 * - Mixed units: "10px 20%" (px and percentage)
 *
 * @module values/parsers/border-radius
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../types';
import { UnitValue, unitParser } from './unit';

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
 * Regex patterns for border-radius detection
 */
const BORDER_RADIUS_PATTERNS = {
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
function parseRadiusValue(value: string): UnitValue {
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
function parseRadiusValues(valuesStr: string): UnitValue[] {
  const values = valuesStr.trim().split(/\s+/);
  return values.map(parseRadiusValue);
}

/**
 * Expand radius values to 4 corners following CSS rules
 * 1 value: all corners
 * 2 values: top-left/bottom-right, top-right/bottom-left
 * 3 values: top-left, top-right/bottom-left, bottom-right
 * 4 values: top-left, top-right, bottom-right, bottom-left
 */
function expandRadiusValues(values: UnitValue[]): [UnitValue, UnitValue, UnitValue, UnitValue] {
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

/**
 * Unit conversion context for border-radius
 * In a real implementation, this would come from the element's computed style
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

/**
 * Convert a unit value to pixels
 */
function convertToPixels(value: UnitValue, context: BorderRadiusContext = {}): UnitValue {
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
 * Converts both values to pixels when units differ
 */
function normalizeUnits(
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

/**
 * Parser for border-radius values
 *
 * Supports single values, multiple values, and elliptical radii.
 * Handles unit conversion for interpolation compatibility.
 */
export class BorderRadiusParser implements ValueParser<BorderRadiusValue> {
  readonly type = ValueType.Unit; // Border radius is a specialized unit type

  /**
   * Detect if a value is a border-radius value
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();

    // Check against all patterns
    return (
      BORDER_RADIUS_PATTERNS.single.test(trimmed) ||
      BORDER_RADIUS_PATTERNS.multiple.test(trimmed) ||
      BORDER_RADIUS_PATTERNS.elliptical.test(trimmed)
    );
  }

  /**
   * Parse a border-radius value
   */
  parse(value: unknown): ParsedValue<BorderRadiusValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Unit, 'Value must be a string');
    }

    const trimmed = value.trim();
    let horizontalValues: UnitValue[];
    let verticalValues: UnitValue[];

    // Check for elliptical format first
    const ellipticalMatch = trimmed.match(BORDER_RADIUS_PATTERNS.elliptical);
    if (ellipticalMatch) {
      horizontalValues = parseRadiusValues(ellipticalMatch[1]);
      verticalValues = parseRadiusValues(ellipticalMatch[2]);
    } else {
      // Single or multiple values (same for horizontal and vertical)
      horizontalValues = parseRadiusValues(trimmed);
      verticalValues = [...horizontalValues]; // Copy for vertical
    }

    // Expand to 4 corners
    const [hTL, hTR, hBR, hBL] = expandRadiusValues(horizontalValues);
    const [vTL, vTR, vBR, vBL] = expandRadiusValues(verticalValues);

    return {
      type: ValueType.Unit,
      value: {
        topLeft: { horizontal: hTL, vertical: vTL },
        topRight: { horizontal: hTR, vertical: vTR },
        bottomRight: { horizontal: hBR, vertical: vBR },
        bottomLeft: { horizontal: hBL, vertical: vBL },
      },
      original: value,
    };
  }

  /**
   * Serialize a border-radius value back to string
   */
  serialize(parsed: ParsedValue<BorderRadiusValue>): string {
    const { topLeft, topRight, bottomRight, bottomLeft } = parsed.value;

    // Check if all corners are the same
    const allSame =
      this.cornersEqual(topLeft, topRight) &&
      this.cornersEqual(topRight, bottomRight) &&
      this.cornersEqual(bottomRight, bottomLeft);

    if (allSame) {
      // Single value
      if (
        topLeft.horizontal.value === topLeft.vertical.value &&
        topLeft.horizontal.unit === topLeft.vertical.unit
      ) {
        return unitParser.serialize({
          type: ValueType.Unit,
          value: topLeft.horizontal,
          original: '',
        });
      } else {
        // Elliptical single value
        const h = unitParser.serialize({
          type: ValueType.Unit,
          value: topLeft.horizontal,
          original: '',
        });
        const v = unitParser.serialize({
          type: ValueType.Unit,
          value: topLeft.vertical,
          original: '',
        });
        return `${h} / ${v}`;
      }
    }

    // Check if we need elliptical format
    const needsElliptical =
      topLeft.horizontal.value !== topLeft.vertical.value ||
      topRight.horizontal.value !== topRight.vertical.value ||
      bottomRight.horizontal.value !== bottomRight.vertical.value ||
      bottomLeft.horizontal.value !== bottomLeft.vertical.value ||
      topLeft.horizontal.unit !== topLeft.vertical.unit ||
      topRight.horizontal.unit !== topRight.vertical.unit ||
      bottomRight.horizontal.unit !== bottomRight.vertical.unit ||
      bottomLeft.horizontal.unit !== bottomLeft.vertical.unit;

    if (needsElliptical) {
      // Elliptical format
      const hValues = [
        unitParser.serialize({ type: ValueType.Unit, value: topLeft.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: topRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomLeft.horizontal, original: '' }),
      ];
      const vValues = [
        unitParser.serialize({ type: ValueType.Unit, value: topLeft.vertical, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: topRight.vertical, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomRight.vertical, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomLeft.vertical, original: '' }),
      ];

      return `${hValues.join(' ')} / ${vValues.join(' ')}`;
    } else {
      // Regular format (horizontal values only)
      const values = [
        unitParser.serialize({ type: ValueType.Unit, value: topLeft.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: topRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomLeft.horizontal, original: '' }),
      ];

      return values.join(' ');
    }
  }

  /**
   * Interpolate between two border-radius values
   */
  interpolate(
    from: BorderRadiusValue,
    to: BorderRadiusValue,
    progress: number,
    context?: BorderRadiusContext,
  ): BorderRadiusValue {
    return {
      topLeft: this.interpolateCorner(from.topLeft, to.topLeft, progress, context),
      topRight: this.interpolateCorner(from.topRight, to.topRight, progress, context),
      bottomRight: this.interpolateCorner(from.bottomRight, to.bottomRight, progress, context),
      bottomLeft: this.interpolateCorner(from.bottomLeft, to.bottomLeft, progress, context),
    };
  }

  /**
   * Check if two corners are equal
   */
  private cornersEqual(corner1: BorderRadiusCorner, corner2: BorderRadiusCorner): boolean {
    return (
      corner1.horizontal.value === corner2.horizontal.value &&
      corner1.horizontal.unit === corner2.horizontal.unit &&
      corner1.vertical.value === corner2.vertical.value &&
      corner1.vertical.unit === corner2.vertical.unit
    );
  }

  /**
   * Interpolate between two corner values
   */
  private interpolateCorner(
    from: BorderRadiusCorner,
    to: BorderRadiusCorner,
    progress: number,
    context?: BorderRadiusContext,
  ): BorderRadiusCorner {
    // Normalize units for interpolation
    const [fromH, toH] = normalizeUnits(from.horizontal, to.horizontal, context);
    const [fromV, toV] = normalizeUnits(from.vertical, to.vertical, context);

    return {
      horizontal: unitParser.interpolate(fromH, toH, progress),
      vertical: unitParser.interpolate(fromV, toV, progress),
    };
  }
}

/**
 * Default border radius parser instance
 */
export const borderRadiusParser = new BorderRadiusParser();
