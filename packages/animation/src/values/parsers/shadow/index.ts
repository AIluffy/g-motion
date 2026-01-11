/**
 * Shadow Parser Index
 *
 * Main entry point for shadow parsing functionality.
 *
 * @module values/parsers/shadow
 */

// Re-export types
export type { ShadowValue, ShadowsValue } from './types';

// Re-export utilities
export {
  BOX_SHADOW_PATTERN,
  TEXT_SHADOW_PATTERN,
  SHADOW_SEPARATOR,
  parseSingleShadow,
} from './utils';

// Re-export serialization functions
export { serializeSingleShadow } from './serialize';

// Re-export interpolation functions
export { interpolateSingleShadow, normalizeShadowCounts } from './interpolate';

// Re-export parser
import { ShadowParser } from './parser';

// Create and export default instance
export const shadowParser = new ShadowParser();

export { ShadowParser };
