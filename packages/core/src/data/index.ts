/**
 * Data structures and buffer management for Motion Engine
 *
 * This module provides optimized data structures for storing and manipulating
 * animation data with focus on memory efficiency and performance.
 */

export {
  HalfFloatBuffer,
  createHalfFloatBufferFrom,
  DEFAULT_HALF_FLOAT_COMPONENTS,
  shouldUseHalfFloat,
  type BufferTypeConfig,
} from './half-float';
