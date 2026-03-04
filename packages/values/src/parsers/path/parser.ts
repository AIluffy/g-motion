/**
 * Path Parser
 *
 * Parser for SVG path data values implementing the ValueParser interface.
 *
 * @module values/parsers/path/parser
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../../core/types';
import type { PathValue } from './types';
import { parsePath, PATH_DETECT_REGEX } from './utils';
import { serializePath } from './serialize';
import { interpolatePath } from './interpolate';

/**
 * Parser for SVG path data values
 */
export class PathParser implements ValueParser<PathValue> {
  readonly type = ValueType.Path;

  /**
   * Detect if a value is an SVG path
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();
    return PATH_DETECT_REGEX.test(trimmed);
  }

  /**
   * Parse an SVG path data string
   */
  parse(value: unknown): ParsedValue<PathValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Path, 'Value must be a string');
    }

    const trimmed = value.trim();

    try {
      const commands = parsePath(trimmed);

      if (commands.length === 0) {
        throw new Error('No valid path commands found');
      }

      return {
        type: ValueType.Path,
        value: { commands },
        original: value,
      };
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Path,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }
  }

  /**
   * Serialize a path value back to SVG path data string
   */
  serialize(parsed: ParsedValue<PathValue>): string {
    return serializePath(parsed.value.commands);
  }

  /**
   * Interpolate between two path values
   */
  interpolate(from: PathValue, to: PathValue, progress: number): PathValue {
    return interpolatePath(from, to, progress);
  }
}
