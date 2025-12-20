/**
 * Color Value Parser
 *
 * Handles parsing and interpolation of color values in various formats:
 * - Hex: #RGB, #RRGGBB, #RRGGBBAA
 * - RGB: rgb(r, g, b), rgba(r, g, b, a)
 * - HSL: hsl(h, s%, l%), hsla(h, s%, l%, a)
 * - Named colors: red, blue, transparent, etc.
 *
 * @module values/parsers/color
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../types';

/**
 * Color representation in RGBA format
 * All components are normalized to standard ranges
 */
export interface ColorValue {
  /** Red channel (0-255) */
  r: number;
  /** Green channel (0-255) */
  g: number;
  /** Blue channel (0-255) */
  b: number;
  /** Alpha channel (0-1) */
  a: number;
}

/**
 * Named CSS colors mapping
 */
const NAMED_COLORS: Record<string, string> = {
  transparent: '#00000000',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  gold: '#ffd700',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  maroon: '#800000',
  lime: '#00ff00',
  aqua: '#00ffff',
  fuchsia: '#ff00ff',
  coral: '#ff7f50',
  salmon: '#fa8072',
  tomato: '#ff6347',
  crimson: '#dc143c',
  indigo: '#4b0082',
  violet: '#ee82ee',
  plum: '#dda0dd',
  orchid: '#da70d6',
  lavender: '#e6e6fa',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  linen: '#faf0e6',
  wheat: '#f5deb3',
  tan: '#d2b48c',
  chocolate: '#d2691e',
  sienna: '#a0522d',
  peru: '#cd853f',
  khaki: '#f0e68c',
  darkkhaki: '#bdb76b',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  dimgray: '#696969',
  dimgrey: '#696969',
  slategray: '#708090',
  slategrey: '#708090',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  bisque: '#ffe4c4',
  blanchedalmond: '#ffebcd',
  blueviolet: '#8a2be2',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgreen: '#006400',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  greenyellow: '#adff2f',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  limegreen: '#32cd32',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  oldlace: '#fdf5e6',
  olivedrab: '#6b8e23',
  orangered: '#ff4500',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  powderblue: '#b0e0e6',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  thistle: '#d8bfd8',
  turquoise: '#40e0d0',
  whitesmoke: '#f5f5f5',
  yellowgreen: '#9acd32',
};

// Regex patterns for color detection
const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_PATTERN =
  /^rgba?\s*\(\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?)?\s*\)$/i;
const HSL_PATTERN =
  /^hsla?\s*\(\s*[\d.]+(?:deg|rad|turn)?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?)?\s*\)$/i;

// ============================================================================
// Color Space Conversion Utilities
// ============================================================================

/**
 * Convert RGB to HSL color space
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns [h, s, l] where h is 0-360, s and l are 0-100
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l * 100];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return [h * 360, s * 100, l * 100];
}

/**
 * Convert HSL to RGB color space
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns [r, g, b] where each is 0-255
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/**
 * Convert hex color string to RGB
 * @param hex - Hex color string (#RGB, #RRGGBB, #RGBA, #RRGGBBAA)
 * @returns [r, g, b, a] where r,g,b are 0-255 and a is 0-1
 */
export function hexToRgba(hex: string): [number, number, number, number] {
  // Remove # prefix
  hex = hex.replace(/^#/, '');

  let r: number,
    g: number,
    b: number,
    a: number = 1;

  if (hex.length === 3) {
    // #RGB
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 4) {
    // #RGBA
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
    a = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 6) {
    // #RRGGBB
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (hex.length === 8) {
    // #RRGGBBAA
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`Invalid hex color: #${hex}`);
  }

  return [r, g, b, a];
}

/**
 * Convert RGB to hex color string
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @param a - Alpha (0-1), optional
 * @returns Hex color string (#RRGGBB or #RRGGBBAA)
 */
export function rgbaToHex(r: number, g: number, b: number, a?: number): string {
  const toHex = (n: number): string => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

  if (a !== undefined && a < 1) {
    return hex + toHex(Math.round(a * 255));
  }

  return hex;
}

// Legacy aliases for compatibility
export const hexToRgb = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgba(hex);
  return [r, g, b];
};

export const rgbToHex = (r: number, g: number, b: number): string => rgbaToHex(r, g, b);

// ============================================================================
// Color Parsing Helpers
// ============================================================================

/**
 * Parse rgb() or rgba() color string
 */
function parseRgb(value: string): ColorValue {
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
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
    a: Math.max(0, Math.min(1, a)),
  };
}

/**
 * Parse hsl() or hsla() color string
 */
function parseHsl(value: string): ColorValue {
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
    a: Math.max(0, Math.min(1, a)),
  };
}

/**
 * Parse hex color string
 */
function parseHex(value: string): ColorValue {
  const [r, g, b, a] = hexToRgba(value);
  return { r, g, b, a };
}

/**
 * Parse named color
 */
function parseNamedColor(value: string): ColorValue {
  const hex = NAMED_COLORS[value.toLowerCase()];
  if (!hex) {
    throw new Error(`Unknown color name: ${value}`);
  }
  return parseHex(hex);
}

// ============================================================================
// Color Interpolation
// ============================================================================

/**
 * Interpolate between two colors in RGB space
 */
export function interpolateRgb(from: ColorValue, to: ColorValue, progress: number): ColorValue {
  return {
    r: from.r + (to.r - from.r) * progress,
    g: from.g + (to.g - from.g) * progress,
    b: from.b + (to.b - from.b) * progress,
    a: from.a + (to.a - from.a) * progress,
  };
}

/**
 * Interpolate between two colors in HSL space
 * Uses shortest path for hue interpolation
 */
export function interpolateHsl(from: ColorValue, to: ColorValue, progress: number): ColorValue {
  const [fromH, fromS, fromL] = rgbToHsl(from.r, from.g, from.b);
  const [toH, toS, toL] = rgbToHsl(to.r, to.g, to.b);

  // Calculate shortest path for hue
  let deltaH = toH - fromH;
  if (deltaH > 180) {
    deltaH -= 360;
  } else if (deltaH < -180) {
    deltaH += 360;
  }

  const h = (((fromH + deltaH * progress) % 360) + 360) % 360;
  const s = fromS + (toS - fromS) * progress;
  const l = fromL + (toL - fromL) * progress;
  const a = from.a + (to.a - from.a) * progress;

  const [r, g, b] = hslToRgb(h, s, l);

  return { r, g, b, a };
}

// ============================================================================
// Color Parser Class
// ============================================================================

/**
 * Color interpolation mode
 */
export type ColorInterpolationMode = 'rgb' | 'hsl';

/**
 * Parser for color values
 *
 * Supports hex, rgb, rgba, hsl, hsla, and named colors.
 * Default interpolation is in RGB space.
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

/**
 * Default color parser instance
 */
export const colorParser = new ColorParser();
