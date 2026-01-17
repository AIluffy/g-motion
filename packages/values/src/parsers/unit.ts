/**
 * Unit Value Parser
 *
 * Handles parsing and interpolation of values with CSS units:
 * - Length: px, em, rem, %, vw, vh, vmin, vmax, ch, ex
 * - Angle: deg, rad, turn, grad
 * - Time: s, ms
 * - Frequency: Hz, kHz
 *
 * @module values/parsers/unit
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../types';

/**
 * Unit value representation
 */
export interface UnitValue {
  /** The numeric value */
  value: number;
  /** The unit string (e.g., 'px', 'em', '%') */
  unit: string;
}

/**
 * Supported CSS units grouped by category
 */
export const SUPPORTED_UNITS = {
  /** Length units */
  length: [
    'px',
    'em',
    'rem',
    '%',
    'vw',
    'vh',
    'vmin',
    'vmax',
    'ch',
    'ex',
    'cm',
    'mm',
    'in',
    'pt',
    'pc',
  ],
  /** Angle units */
  angle: ['deg', 'rad', 'turn', 'grad'],
  /** Time units */
  time: ['s', 'ms'],
  /** Frequency units */
  frequency: ['hz', 'khz'],
} as const;

/**
 * All supported units as a flat array (lowercase)
 */
export const ALL_UNITS: string[] = [
  ...SUPPORTED_UNITS.length,
  ...SUPPORTED_UNITS.angle,
  ...SUPPORTED_UNITS.time,
  ...SUPPORTED_UNITS.frequency,
];

/**
 * Regex pattern for detecting unit values
 * Matches: number followed by a unit (e.g., "10px", "-3.5em", ".5rem")
 */
const UNIT_PATTERN = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z%]+)$/i;

/**
 * Get the category of a unit
 */
export function getUnitCategory(unit: string): keyof typeof SUPPORTED_UNITS | undefined {
  const lowerUnit = unit.toLowerCase();
  for (const [category, units] of Object.entries(SUPPORTED_UNITS)) {
    if ((units as readonly string[]).includes(lowerUnit)) {
      return category as keyof typeof SUPPORTED_UNITS;
    }
  }
  return undefined;
}

/**
 * Check if two units are compatible (same category)
 */
export function areUnitsCompatible(unit1: string, unit2: string): boolean {
  const cat1 = getUnitCategory(unit1);
  const cat2 = getUnitCategory(unit2);
  return cat1 !== undefined && cat1 === cat2;
}

/**
 * Parser for values with CSS units
 *
 * Supports length, angle, time, and frequency units.
 * Interpolation preserves the unit from the starting value.
 */
export class UnitParser implements ValueParser<UnitValue> {
  readonly type = ValueType.Unit;

  /**
   * Detect if a value is a unit value
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();
    const match = trimmed.match(UNIT_PATTERN);

    if (!match) {
      return false;
    }

    const unit = match[2].toLowerCase();
    return ALL_UNITS.includes(unit);
  }

  /**
   * Parse a unit value
   */
  parse(value: unknown): ParsedValue<UnitValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Unit, 'Value must be a string');
    }

    const trimmed = value.trim();
    const match = trimmed.match(UNIT_PATTERN);

    if (!match) {
      throw new ValueParseError(value, ValueType.Unit, 'Invalid unit value format');
    }

    const numericValue = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    if (!ALL_UNITS.includes(unit)) {
      throw new ValueParseError(value, ValueType.Unit, `Unsupported unit: ${unit}`);
    }

    if (Number.isNaN(numericValue)) {
      throw new ValueParseError(value, ValueType.Unit, 'Invalid numeric value');
    }

    return {
      type: ValueType.Unit,
      value: {
        value: numericValue,
        unit,
      },
      unit,
      original: value,
    };
  }

  /**
   * Serialize a unit value back to string
   */
  serialize(parsed: ParsedValue<UnitValue>): string {
    const { value, unit } = parsed.value;
    // Round to avoid floating point precision issues
    const roundedValue = Math.round(value * 1000) / 1000;
    return `${roundedValue}${unit}`;
  }

  /**
   * Interpolate between two unit values
   * Preserves the unit from the 'from' value
   */
  interpolate(from: UnitValue, to: UnitValue, progress: number): UnitValue {
    // Linear interpolation of the numeric value
    const interpolatedValue = from.value + (to.value - from.value) * progress;

    // Use the 'from' unit (or 'to' unit if they're the same)
    // In practice, animations should use the same unit for from/to
    return {
      value: interpolatedValue,
      unit: from.unit,
    };
  }
}

/**
 * Default unit parser instance
 */
export const unitParser = new UnitParser();
