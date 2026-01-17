/**
 * Path Parser Index
 *
 * Main entry point for path parsing functionality.
 * Re-exports all public APIs from the split modules.
 *
 * @module values/parsers/path
 */

// Re-export types
export type {
  PathCommand,
  PathValue,
  MoveToCommand,
  LineToCommand,
  HorizontalLineCommand,
  VerticalLineCommand,
  CubicBezierCommand,
  SmoothCubicCommand,
  QuadraticBezierCommand,
  SmoothQuadraticCommand,
  ArcCommand,
  ClosePathCommand,
} from './types';

// Re-export parsing utilities
export { parsePath, PATH_DETECT_REGEX } from './utils';

// Re-export normalization functions
export { commandToAbsolute, normalizePath, normalizePaths } from './normalize';

// Re-export serialization functions
export { serializePath } from './serialize';

// Re-export interpolation functions
export { interpolatePath } from './interpolate';

// Re-export parser
import { PathParser } from './parser';

// Create and export default instance
export const pathParser = new PathParser();

export { PathParser };
