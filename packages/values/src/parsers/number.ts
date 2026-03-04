/**
 * Number Value Parser
 *
 * Handles parsing and interpolation of pure numeric values.
 *
 * @module values/parsers/number
 */

import { ValueType, ValueParser, ParsedValue } from '../core/types';

/**
 * Parser for numeric values
 *
 * Detects and handles pure numbers (integers and floats).
 */
export class NumberParser implements ValueParser<number> {
  readonly type = ValueType.Number;

  /**
   * Detect if a value is a pure number
   */
  detect(value: unknown): boolean {
    if (typeof value === 'number') {
      return !Number.isNaN(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return false;

      // Check if it's a pure number (no units)
      const num = Number(trimmed);
      return !Number.isNaN(num) && trimmed === String(num);
    }

    return false;
  }

  /**
   * Parse a numeric value
   */
  parse(value: unknown): ParsedValue<number> {
    let num: number;

    if (typeof value === 'number') {
      num = value;
    } else if (typeof value === 'string') {
      num = Number(value.trim());
    } else {
      num = Number(value);
    }

    if (Number.isNaN(num)) {
      throw new Error(`Cannot parse "${value}" as number`);
    }

    return {
      type: ValueType.Number,
      value: num,
      original: typeof value === 'string' || typeof value === 'number' ? value : String(value),
    };
  }

  /**
   * Serialize a number back to its representation
   */
  serialize(parsed: ParsedValue<number>): number {
    return parsed.value;
  }

  /**
   * Linear interpolation between two numbers
   */
  interpolate(from: number, to: number, progress: number): number {
    return from + (to - from) * progress;
  }
}

/**
 * Default number parser instance
 */
export const numberParser = new NumberParser();
