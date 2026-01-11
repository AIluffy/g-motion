/**
 * Transform Parser Index
 *
 * Main entry point for transform parsing functionality.
 * Re-exports all public APIs from the split modules.
 *
 * @module values/parsers/transform
 */

// Re-export types
export type { TransformProperties, TransformOrigin, Rotate3D, Quaternion } from './types';

// Re-export quaternion utilities
export {
  axisAngleToQuaternion,
  quaternionToAxisAngle,
  normalizeQuaternion,
  quaternionDot,
  slerp,
} from './quaternion';

// Re-export parsing utilities
export { parseTransformString, parseTransformOrigin, TRANSFORM_DETECT_REGEX } from './utils';

// Re-export composer
import { TransformComposer } from './composer';

// Re-export parser
import { TransformParser } from './parser';

// Create and export default instances
export const transformParser = new TransformParser();
export const transformComposer = new TransformComposer();

export { TransformComposer, TransformParser };
