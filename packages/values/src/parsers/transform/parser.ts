/**
 * Transform Parser
 *
 * Parser for CSS transform values implementing the ValueParser interface.
 *
 * @module values/parsers/transform/parser
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../../core/types';
import type { TransformProperties } from './types';
import { TransformComposer } from './composer';
import { TRANSFORM_DETECT_REGEX } from './utils';

/**
 * Parser for CSS transform values
 */
export class TransformParser implements ValueParser<TransformProperties> {
  readonly type = ValueType.Transform;

  private composer = new TransformComposer();

  /**
   * Detect if a value is a CSS transform string
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim().toLowerCase();

    // Check for 'none'
    if (trimmed === 'none') {
      return true;
    }

    // Check for transform functions
    return TRANSFORM_DETECT_REGEX.test(trimmed);
  }

  /**
   * Parse a CSS transform string
   */
  parse(value: unknown): ParsedValue<TransformProperties> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Transform, 'Value must be a string');
    }

    const trimmed = value.trim();

    if (trimmed.toLowerCase() === 'none' || trimmed === '') {
      return {
        type: ValueType.Transform,
        value: {},
        original: value,
      };
    }

    try {
      const props = this.composer.decompose(trimmed);
      return {
        type: ValueType.Transform,
        value: props,
        original: value,
      };
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Transform,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }
  }

  /**
   * Serialize transform properties back to CSS string
   */
  serialize(parsed: ParsedValue<TransformProperties>): string {
    return this.composer.compose(parsed.value);
  }

  /**
   * Interpolate between two transform property sets
   */
  interpolate(
    from: TransformProperties,
    to: TransformProperties,
    progress: number,
  ): TransformProperties {
    return this.composer.interpolate(from, to, progress);
  }

  /**
   * Get the internal composer instance
   */
  getComposer(): TransformComposer {
    return this.composer;
  }
}
