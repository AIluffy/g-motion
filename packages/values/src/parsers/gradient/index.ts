/**
 * Gradient Parser Index
 *
 * Main entry point for gradient parsing functionality.
 * Re-exports all public APIs from the split modules.
 *
 * @module values/parsers/gradient
 */

// Re-export types
export type {
  GradientValue,
  GradientStop,
  GradientType,
  RadialShape,
  RadialSize,
  PositionValue,
} from './types';

// Re-export parsing utilities
export {
  GRADIENT_PATTERN,
  splitGradientArgs,
  parseColorStop,
  parseLinearGradient,
  parseRadialGradient,
  parseConicGradient,
} from './utils';

// Re-export serialization functions
export { serializeColor, serializeStop, serializeGradient } from './serialize';

// Re-export interpolation functions
export {
  normalizeStops,
  matchStopCounts,
  interpolateStop,
  interpolateGradient,
} from './interpolate';

// Re-export parser
import { GradientParser } from './parser';

// Create and export default instance
export const gradientParser = new GradientParser();

export { GradientParser };
