/**
 * Color Parser
 *
 * Parser for color values implementing the ValueParser interface.
 *
 * @module values/parsers/color/parser
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../../core/types';
import type { ColorValue, ColorInterpolationMode } from './types';
import {
  HEX_PATTERN,
  RGB_PATTERN,
  HSL_PATTERN,
  parseRgb,
  parseHsl,
  parseHex,
  parseNamedColor,
} from './utils';
import { NAMED_COLORS } from './named';
import { rgbaToHex } from './convert';
import { interpolateRgb, interpolateHsl } from './interpolate';

/**
 * Parser for color values
 */
export class ColorParser implements ValueParser<ColorValue> {
  readonly type = ValueType.Color;

  /** Interpolation mode (rgb or hsl) */
  interpolationMode: ColorInterpolationMode = 'rgb';

  /**
   * Detect if a value is a color
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim().toLowerCase();

    // Check hex format
    if (HEX_PATTERN.test(trimmed)) {
      return true;
    }

    // Check rgb/rgba format
    if (RGB_PATTERN.test(trimmed)) {
      return true;
    }

    // Check hsl/hsla format
    if (HSL_PATTERN.test(trimmed)) {
      return true;
    }

    // Check named colors
    if (NAMED_COLORS[trimmed]) {
      return true;
    }

    return false;
  }

  /**
   * Parse a color value
   */
  parse(value: unknown): ParsedValue<ColorValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Color, 'Value must be a string');
    }

    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    let colorValue: ColorValue;

    try {
      if (HEX_PATTERN.test(lower)) {
        colorValue = parseHex(trimmed);
      } else if (lower.startsWith('rgb')) {
        colorValue = parseRgb(trimmed);
      } else if (lower.startsWith('hsl')) {
        colorValue = parseHsl(trimmed);
      } else if (NAMED_COLORS[lower]) {
        colorValue = parseNamedColor(lower);
      } else {
        throw new Error(`Unrecognized color format: ${value}`);
      }
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Color,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }

    return {
      type: ValueType.Color,
      value: colorValue,
      original: value,
    };
  }

  /**
   * Serialize a color back to rgba() string
   */
  serialize(parsed: ParsedValue<ColorValue>): string {
    const { r, g, b, a } = parsed.value;

    // Round RGB values
    const rr = Math.round(r);
    const gg = Math.round(g);
    const bb = Math.round(b);

    if (a < 1) {
      // Use rgba for transparency
      return `rgba(${rr}, ${gg}, ${bb}, ${Number(a.toFixed(3))})`;
    }

    // Use hex for opaque colors (more compact)
    return rgbaToHex(rr, gg, bb);
  }

  /**
   * Interpolate between two colors
   */
  interpolate(from: ColorValue, to: ColorValue, progress: number): ColorValue {
    if (this.interpolationMode === 'hsl') {
      return interpolateHsl(from, to, progress);
    }
    return interpolateRgb(from, to, progress);
  }
}
