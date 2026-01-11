/**
 * Border Radius Parser Index
 *
 * Main entry point for border-radius parsing functionality.
 *
 * @module values/parsers/border-radius
 */

// Re-export types
export type { BorderRadiusValue, BorderRadiusCorner, BorderRadiusContext } from './types';

// Re-export utilities
export {
  BORDER_RADIUS_PATTERNS,
  parseRadiusValue,
  parseRadiusValues,
  expandRadiusValues,
} from './utils';

// Re-export conversion functions
export { convertToPixels, normalizeUnits } from './convert';

// Re-export parser
import { BorderRadiusParser } from './parser';

// Create and export default instance
export const borderRadiusParser = new BorderRadiusParser();

export { BorderRadiusParser };
