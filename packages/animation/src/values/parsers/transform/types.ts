/**
 * Transform Types and Interfaces
 *
 * Type definitions for transform properties, origins, and quaternions.
 *
 * @module values/parsers/transform/types
 */

/**
 * Individual transform properties
 * All numeric values are in their native units (px for translation, deg for rotation)
 */
export interface TransformProperties {
  /** X translation in pixels */
  x?: number;
  /** Y translation in pixels */
  y?: number;
  /** Z translation in pixels */
  z?: number;
  /** X-axis rotation in degrees */
  rotateX?: number;
  /** Y-axis rotation in degrees */
  rotateY?: number;
  /** Z-axis rotation in degrees (same as rotate) */
  rotateZ?: number;
  /** Alias for rotateZ */
  rotate?: number;
  /** X-axis scale factor */
  scaleX?: number;
  /** Y-axis scale factor */
  scaleY?: number;
  /** Z-axis scale factor */
  scaleZ?: number;
  /** Uniform scale factor (applies to all axes) */
  scale?: number;
  /** X-axis skew in degrees */
  skewX?: number;
  /** Y-axis skew in degrees */
  skewY?: number;
  /** Perspective distance in pixels */
  perspective?: number;
  /** Transform origin point */
  transformOrigin?: TransformOrigin;
  /** Perspective origin point */
  perspectiveOrigin?: TransformOrigin;
  /** 3D rotation using axis-angle representation */
  rotate3d?: Rotate3D;
}

/**
 * Transform origin representation
 */
export interface TransformOrigin {
  /** X position (number in px or string like '50%', 'left', 'center', 'right') */
  x: number | string;
  /** Y position (number in px or string like '50%', 'top', 'center', 'bottom') */
  y: number | string;
  /** Z position in pixels (optional) */
  z?: number;
}

/**
 * 3D rotation using axis-angle representation
 */
export interface Rotate3D {
  /** X component of rotation axis */
  x: number;
  /** Y component of rotation axis */
  y: number;
  /** Z component of rotation axis */
  z: number;
  /** Rotation angle in degrees */
  angle: number;
}

/**
 * Quaternion representation for smooth 3D rotation interpolation
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}
