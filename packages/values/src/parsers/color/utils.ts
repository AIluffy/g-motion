/**
 * Color Parsing Utilities
 *
 * Helper functions for parsing different color formats.
 *
 * @module values/parsers/color/utils
 */

import type { ColorValue } from './types';
import { hexToRgba, hslToRgb } from './convert';
import { NAMED_COLORS } from './named';
import { clamp, clamp01 } from '@g-motion/shared';

// Regex patterns for color detection
export const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const RGB_PATTERN =
  /^rgba?\s*\(\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?)?\s*\)$/i;
export const HSL_PATTERN =
  /^hsla?\s*\(\s*[\d.]+(?:deg|rad|turn)?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?)?\s*\)$/i;

/**
 * Parse rgb() or rgba() color string
 */
export function parseRgb(value: string): ColorValue {
  // Modern syntax: rgb(r g b / a) or legacy: rgb(r, g, b) / rgba(r, g, b, a)
  const match = value.match(
    /rgba?\s*\(\s*([\d.]+)(%?)\s*[,\s]\s*([\d.]+)(%?)\s*[,\s]\s*([\d.]+)(%?)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)/i,
  );

  if (!match) {
    throw new Error(`Invalid rgb/rgba color: ${value}`);
  }

  const parseChannel = (val: string, isPercent: boolean): number => {
    const num = parseFloat(val);
    return isPercent ? (num / 100) * 255 : num;
  };

  const r = parseChannel(match[1], match[2] === '%');
  const g = parseChannel(match[3], match[4] === '%');
  const b = parseChannel(match[5], match[6] === '%');
  let a = 1;

  if (match[7] !== undefined) {
    a = match[8] === '%' ? parseFloat(match[7]) / 100 : parseFloat(match[7]);
  }

  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
    a: clamp01(a),
  };
}

/**
 * Parse hsl() or hsla() color string
 */
export function parseHsl(value: string): ColorValue {
  // Modern syntax: hsl(h s l / a) or legacy: hsl(h, s%, l%) / hsla(h, s%, l%, a)
  const match = value.match(
    /hsla?\s*\(\s*([\d.]+)(deg|rad|turn)?\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)/i,
  );

  if (!match) {
    throw new Error(`Invalid hsl/hsla color: ${value}`);
  }

  let h = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase();

  // Convert angle units to degrees
  if (unit === 'rad') {
    h = (h * 180) / Math.PI;
  } else if (unit === 'turn') {
    h = h * 360;
  }

  // Normalize hue to 0-360
  h = ((h % 360) + 360) % 360;

  const s = parseFloat(match[3]);
  const l = parseFloat(match[4]);
  let a = 1;

  if (match[5] !== undefined) {
    a = match[6] === '%' ? parseFloat(match[5]) / 100 : parseFloat(match[5]);
  }

  const [r, g, b] = hslToRgb(h, s, l);

  return {
    r,
    g,
    b,
    a: clamp01(a),
  };
}

/**
 * Parse hex color string
 */
export function parseHex(value: string): ColorValue {
  const [r, g, b, a] = hexToRgba(value);
  return { r, g, b, a };
}

/**
 * Parse named color
 */
export function parseNamedColor(value: string): ColorValue {
  const hex = NAMED_COLORS[value.toLowerCase()];
  if (!hex) {
    throw new Error(`Unknown color name: ${value}`);
  }
  return parseHex(hex);
}
