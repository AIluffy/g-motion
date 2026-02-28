/**
 * Gradient Parser
 *
 * Parser for CSS gradient values implementing the ValueParser interface.
 *
 * @module values/parsers/gradient/parser
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../../types';
import type { GradientValue, GradientType } from './types';
import {
  GRADIENT_PATTERN,
  splitGradientArgs,
  parseLinearGradient,
  parseRadialGradient,
  parseConicGradient,
} from './utils';
import { serializeGradient } from './serialize';
import { interpolateGradient } from './interpolate';

/**
 * Parser for CSS gradient values
 */
export class GradientParser implements ValueParser<GradientValue> {
  readonly type = ValueType.Gradient;

  /**
   * Detect if a value is a gradient
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    return GRADIENT_PATTERN.test(value.trim());
  }

  /**
   * Parse a gradient value
   */
  parse(value: unknown): ParsedValue<GradientValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Gradient, 'Value must be a string');
    }

    const trimmed = value.trim();
    const match = trimmed.match(GRADIENT_PATTERN);

    if (!match) {
      throw new ValueParseError(value, ValueType.Gradient, 'Invalid gradient format');
    }

    const repeating = !!match[1];
    const gradientType = match[2].toLowerCase() as GradientType;

    // Extract content inside parentheses
    const startParen = trimmed.indexOf('(');
    const endParen = trimmed.lastIndexOf(')');

    if (startParen === -1 || endParen === -1 || endParen <= startParen) {
      throw new ValueParseError(value, ValueType.Gradient, 'Missing parentheses');
    }

    const content = trimmed.slice(startParen + 1, endParen);
    const args = splitGradientArgs(content);

    let gradientValue: Partial<GradientValue>;

    try {
      switch (gradientType) {
        case 'linear':
          gradientValue = parseLinearGradient(args);
          break;
        case 'radial':
          gradientValue = parseRadialGradient(args);
          break;
        case 'conic':
          gradientValue = parseConicGradient(args);
          break;
        default:
          throw new Error(`Unknown gradient type: ${gradientType}`);
      }
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Gradient,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }

    gradientValue.repeating = repeating;

    return {
      type: ValueType.Gradient,
      value: gradientValue as GradientValue,
      original: value,
    };
  }

  /**
   * Serialize a gradient back to CSS string
   */
  serialize(parsed: ParsedValue<GradientValue>): string {
    return serializeGradient(parsed.value);
  }

  /**
   * Interpolate between two gradients
   */
  interpolate(from: GradientValue, to: GradientValue, progress: number): GradientValue {
    return interpolateGradient(from, to, progress);
  }
}
