/**
 * Color Parser Index
 *
 * Main entry point for color parsing functionality.
 * Re-exports all public APIs from the split modules.
 *
 * @module values/parsers/color
 */

// Re-export types
export type { ColorValue, ColorInterpolationMode } from './types';

// Re-export named colors
export { NAMED_COLORS } from './named';

// Re-export conversion utilities
export { rgbToHsl, hslToRgb, hexToRgba, rgbaToHex, hexToRgb, rgbToHex } from './convert';

// Re-export parsing utilities
export {
  HEX_PATTERN,
  RGB_PATTERN,
  HSL_PATTERN,
  parseRgb,
  parseHsl,
  parseHex,
  parseNamedColor,
} from './utils';

// Re-export interpolation functions
export { interpolateRgb, interpolateHsl } from './interpolate';

// Re-export parser
import { ColorParser } from './parser';

// Create and export default instance
export const colorParser = new ColorParser();

export { ColorParser };
