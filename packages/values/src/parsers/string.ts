/**
 * String Value Parser
 *
 * Handles parsing and interpolation of string values.
 * Used as a fallback parser when no other parser matches.
 *
 * @module values/parsers/string
 */

import { ValueType, ValueParser, ParsedValue } from '../core/types';

/**
 * Parser for string values
 *
 * Acts as a fallback parser for values that don't match other types.
 * String interpolation returns the 'from' value until progress >= 1,
 * then returns the 'to' value.
 */
export class StringParser implements ValueParser<string> {
  readonly type = ValueType.String;

  /**
   * Detect if a value is a string
   * This parser has lowest priority and accepts any string
   */
  detect(value: unknown): boolean {
    return typeof value === 'string';
  }

  /**
   * Parse a string value
   */
  parse(value: unknown): ParsedValue<string> {
    const str = String(value);

    return {
      type: ValueType.String,
      value: str,
      original: typeof value === 'string' || typeof value === 'number' ? value : str,
    };
  }

  /**
   * Serialize a string back to its representation
   */
  serialize(parsed: ParsedValue<string>): string {
    return parsed.value;
  }

  /**
   * Discrete interpolation between two strings
   * Returns 'from' until progress >= 1, then returns 'to'
   */
  interpolate(from: string, to: string, progress: number): string {
    return progress < 1 ? from : to;
  }
}

/**
 * Default string parser instance
 */
export const stringParser = new StringParser();
