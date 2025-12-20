/**
 * Transform Value Parser and Composer
 *
 * Handles parsing, composition, and interpolation of CSS transform values.
 * Supports independent transform properties (x, y, z, rotateX, rotateY, rotateZ,
 * scaleX, scaleY, scaleZ, skewX, skewY) and extended properties (perspective,
 * transformOrigin, perspectiveOrigin, translate3d, rotate3d).
 *
 * @module values/parsers/transform
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../types';

// ============================================================================
// Types and Interfaces
// ============================================================================

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

// ============================================================================
// Quaternion Math Utilities
// ============================================================================

/**
 * Create a quaternion from axis-angle representation
 * @param axis - Rotation axis (will be normalized)
 * @param angleDeg - Rotation angle in degrees
 */
export function axisAngleToQuaternion(
  axis: { x: number; y: number; z: number },
  angleDeg: number,
): Quaternion {
  const angleRad = (angleDeg * Math.PI) / 180;
  const halfAngle = angleRad / 2;
  const sinHalf = Math.sin(halfAngle);

  // Normalize axis
  const len = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  if (len === 0) {
    return { x: 0, y: 0, z: 0, w: 1 }; // Identity quaternion
  }

  const nx = axis.x / len;
  const ny = axis.y / len;
  const nz = axis.z / len;

  return {
    x: nx * sinHalf,
    y: ny * sinHalf,
    z: nz * sinHalf,
    w: Math.cos(halfAngle),
  };
}

/**
 * Convert quaternion back to axis-angle representation
 * @param q - Quaternion to convert
 * @returns Object with axis (x, y, z) and angle in degrees
 */
export function quaternionToAxisAngle(q: Quaternion): Rotate3D {
  // Normalize quaternion
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  const qn = {
    x: q.x / len,
    y: q.y / len,
    z: q.z / len,
    w: q.w / len,
  };

  // Ensure w is positive for consistent angle extraction
  if (qn.w < 0) {
    qn.x = -qn.x;
    qn.y = -qn.y;
    qn.z = -qn.z;
    qn.w = -qn.w;
  }

  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, qn.w)));
  const sinHalf = Math.sin(angle / 2);

  if (sinHalf < 0.0001) {
    // No rotation or very small rotation
    return { x: 0, y: 0, z: 1, angle: 0 };
  }

  return {
    x: qn.x / sinHalf,
    y: qn.y / sinHalf,
    z: qn.z / sinHalf,
    angle: (angle * 180) / Math.PI,
  };
}

/**
 * Normalize a quaternion to unit length
 */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len === 0) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  return {
    x: q.x / len,
    y: q.y / len,
    z: q.z / len,
    w: q.w / len,
  };
}

/**
 * Compute the dot product of two quaternions
 */
export function quaternionDot(a: Quaternion, b: Quaternion): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/**
 * Spherical linear interpolation (slerp) between two quaternions
 * Provides smooth rotation interpolation without gimbal lock
 *
 * @param from - Starting quaternion
 * @param to - Ending quaternion
 * @param t - Interpolation parameter (0-1)
 * @returns Interpolated quaternion
 */
export function slerp(from: Quaternion, to: Quaternion, t: number): Quaternion {
  // Normalize inputs
  const q1 = normalizeQuaternion(from);
  let q2 = normalizeQuaternion(to);

  // Compute dot product
  let dot = quaternionDot(q1, q2);

  // If dot is negative, negate one quaternion to take shorter path
  if (dot < 0) {
    q2 = { x: -q2.x, y: -q2.y, z: -q2.z, w: -q2.w };
    dot = -dot;
  }

  // If quaternions are very close, use linear interpolation
  if (dot > 0.9995) {
    return normalizeQuaternion({
      x: q1.x + t * (q2.x - q1.x),
      y: q1.y + t * (q2.y - q1.y),
      z: q1.z + t * (q2.z - q1.z),
      w: q1.w + t * (q2.w - q1.w),
    });
  }

  // Compute slerp
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return {
    x: s0 * q1.x + s1 * q2.x,
    y: s0 * q1.y + s1 * q2.y,
    z: s0 * q1.z + s1 * q2.z,
    w: s0 * q1.w + s1 * q2.w,
  };
}

// ============================================================================
// Transform Parsing Utilities
// ============================================================================

/** Regex to match individual transform functions */
const TRANSFORM_FUNCTION_REGEX = /(\w+)\s*\(\s*([^)]+)\s*\)/g;

/** Regex to detect if a string is a CSS transform */
const TRANSFORM_DETECT_REGEX =
  /^(?:\s*(?:translate(?:X|Y|Z|3d)?|rotate(?:X|Y|Z|3d)?|scale(?:X|Y|Z|3d)?|skew(?:X|Y)?|matrix(?:3d)?|perspective)\s*\([^)]*\)\s*)+$/i;

/**
 * Parse a CSS transform string into individual functions
 */
function parseTransformString(transform: string): Map<string, number[]> {
  const functions = new Map<string, number[]>();
  let match: RegExpExecArray | null;

  TRANSFORM_FUNCTION_REGEX.lastIndex = 0;
  while ((match = TRANSFORM_FUNCTION_REGEX.exec(transform)) !== null) {
    const name = match[1].toLowerCase();
    const args = match[2]
      .split(/[,\s]+/)
      .map((v) => parseFloat(v.replace(/[a-z%]+$/i, '')))
      .filter((v) => !isNaN(v));
    functions.set(name, args);
  }

  return functions;
}

/**
 * Parse transform origin string
 * @param value - CSS transform-origin string
 * @returns Parsed transform origin object
 */
export function parseTransformOrigin(value: string): TransformOrigin {
  const parts = value.trim().split(/\s+/);
  const result: TransformOrigin = { x: '50%', y: '50%' };

  const parseValue = (v: string): number | string => {
    if (v === 'left') return '0%';
    if (v === 'center') return '50%';
    if (v === 'right') return '100%';
    if (v === 'top') return '0%';
    if (v === 'bottom') return '100%';
    if (v.endsWith('%')) return v;
    const num = parseFloat(v);
    return isNaN(num) ? v : num;
  };

  if (parts.length >= 1) {
    result.x = parseValue(parts[0]);
  }
  if (parts.length >= 2) {
    result.y = parseValue(parts[1]);
  }
  if (parts.length >= 3) {
    const z = parseFloat(parts[2]);
    if (!isNaN(z)) {
      result.z = z;
    }
  }

  return result;
}

// ============================================================================
// TransformComposer Class
// ============================================================================

/**
 * Transform composer for independent transform properties
 *
 * Handles composition of individual transform properties into CSS transform
 * strings, decomposition of CSS transforms back to properties, and
 * interpolation between transform states.
 */
export class TransformComposer {
  /**
   * Compose individual properties into CSS transform string
   *
   * The order of transforms follows CSS convention:
   * translate -> rotate -> scale -> skew
   *
   * @param props - Transform properties to compose
   * @returns CSS transform string
   */
  compose(props: TransformProperties): string {
    const transforms: string[] = [];

    // Perspective (applied first)
    if (props.perspective !== undefined) {
      transforms.push(`perspective(${props.perspective}px)`);
    }

    // Translation - include if any translation property is explicitly set
    const hasX = props.x !== undefined;
    const hasY = props.y !== undefined;
    const hasZ = props.z !== undefined;

    if (hasX || hasY || hasZ) {
      const x = props.x ?? 0;
      const y = props.y ?? 0;
      const z = props.z ?? 0;

      if (hasZ) {
        transforms.push(`translate3d(${x}px, ${y}px, ${z}px)`);
      } else if (hasX && hasY) {
        transforms.push(`translate(${x}px, ${y}px)`);
      } else if (hasX) {
        transforms.push(`translateX(${x}px)`);
      } else if (hasY) {
        transforms.push(`translateY(${y}px)`);
      }
    }

    // 3D Rotation (using rotate3d)
    if (props.rotate3d) {
      const { x: rx, y: ry, z: rz, angle } = props.rotate3d;
      transforms.push(`rotate3d(${rx}, ${ry}, ${rz}, ${angle}deg)`);
    } else {
      // Individual axis rotations - include if explicitly set
      if (props.rotateX !== undefined) {
        transforms.push(`rotateX(${props.rotateX}deg)`);
      }
      if (props.rotateY !== undefined) {
        transforms.push(`rotateY(${props.rotateY}deg)`);
      }
      if (props.rotate !== undefined) {
        transforms.push(`rotate(${props.rotate}deg)`);
      } else if (props.rotateZ !== undefined) {
        transforms.push(`rotateZ(${props.rotateZ}deg)`);
      }
    }

    // Scale - include if any scale property is explicitly set
    const hasUniformScale = props.scale !== undefined;
    const hasScaleX = props.scaleX !== undefined;
    const hasScaleY = props.scaleY !== undefined;
    const hasScaleZ = props.scaleZ !== undefined;

    if (hasUniformScale || hasScaleX || hasScaleY || hasScaleZ) {
      const uniformScale = props.scale;
      const scaleX = props.scaleX ?? uniformScale ?? 1;
      const scaleY = props.scaleY ?? uniformScale ?? 1;
      const scaleZ = props.scaleZ ?? 1;

      if (hasScaleZ) {
        transforms.push(`scale3d(${scaleX}, ${scaleY}, ${scaleZ})`);
      } else if (hasUniformScale && !hasScaleX && !hasScaleY) {
        transforms.push(`scale(${uniformScale})`);
      } else if (scaleX === scaleY && !hasScaleX && !hasScaleY) {
        transforms.push(`scale(${scaleX})`);
      } else {
        transforms.push(`scale(${scaleX}, ${scaleY})`);
      }
    }

    // Skew - include if any skew property is explicitly set
    const hasSkewX = props.skewX !== undefined;
    const hasSkewY = props.skewY !== undefined;

    if (hasSkewX && hasSkewY) {
      transforms.push(`skew(${props.skewX}deg, ${props.skewY}deg)`);
    } else if (hasSkewX) {
      transforms.push(`skewX(${props.skewX}deg)`);
    } else if (hasSkewY) {
      transforms.push(`skewY(${props.skewY}deg)`);
    }

    return transforms.length > 0 ? transforms.join(' ') : 'none';
  }

  /**
   * Decompose CSS transform string into individual properties
   *
   * Note: This is a best-effort decomposition. Complex matrix transforms
   * may not decompose perfectly back to the original properties.
   *
   * @param transform - CSS transform string
   * @returns Decomposed transform properties
   */
  decompose(transform: string): TransformProperties {
    if (!transform || transform === 'none') {
      return {};
    }

    const functions = parseTransformString(transform);
    const props: TransformProperties = {};

    // Process each transform function
    for (const [name, args] of functions) {
      switch (name) {
        case 'translatex':
          props.x = args[0] ?? 0;
          break;
        case 'translatey':
          props.y = args[0] ?? 0;
          break;
        case 'translatez':
          props.z = args[0] ?? 0;
          break;
        case 'translate':
          props.x = args[0] ?? 0;
          props.y = args[1] ?? 0;
          break;
        case 'translate3d':
          props.x = args[0] ?? 0;
          props.y = args[1] ?? 0;
          props.z = args[2] ?? 0;
          break;
        case 'rotatex':
          props.rotateX = args[0] ?? 0;
          break;
        case 'rotatey':
          props.rotateY = args[0] ?? 0;
          break;
        case 'rotate':
          props.rotate = args[0] ?? 0;
          break;
        case 'rotatez':
          props.rotateZ = args[0] ?? 0;
          break;
        case 'rotate3d':
          if (args.length >= 4) {
            props.rotate3d = {
              x: args[0],
              y: args[1],
              z: args[2],
              angle: args[3],
            };
          }
          break;
        case 'scalex':
          props.scaleX = args[0] ?? 1;
          break;
        case 'scaley':
          props.scaleY = args[0] ?? 1;
          break;
        case 'scalez':
          props.scaleZ = args[0] ?? 1;
          break;
        case 'scale':
          // For uniform scale, always decompose as scaleX and scaleY
          const scaleX = args[0] ?? 1;
          const scaleY = args[1] ?? scaleX;
          props.scaleX = scaleX;
          props.scaleY = scaleY;
          break;
        case 'scale3d':
          const sx = args[0] ?? 1;
          const sy = args[1] ?? 1;
          const sz = args[2] ?? 1;

          // If scaleZ is different from 1, we need scale3d representation
          if (sz !== 1) {
            // If X and Y are equal and both are 1, only set scaleZ
            if (sx === 1 && sy === 1) {
              props.scaleZ = sz;
            } else {
              props.scaleX = sx;
              props.scaleY = sy;
              props.scaleZ = sz;
            }
          } else {
            // scaleZ is 1, so we can use 2D scale representation
            if (sx === sy) {
              props.scale = sx;
            } else {
              props.scaleX = sx;
              props.scaleY = sy;
            }
          }
          break;
        case 'skewx':
          props.skewX = args[0] ?? 0;
          break;
        case 'skewy':
          props.skewY = args[0] ?? 0;
          break;
        case 'skew':
          props.skewX = args[0] ?? 0;
          props.skewY = args[1] ?? 0;
          break;
        case 'perspective':
          props.perspective = args[0] ?? 0;
          break;
      }
    }

    return props;
  }

  /**
   * Interpolate between two transform property sets
   *
   * Uses linear interpolation for most properties and slerp for rotate3d.
   *
   * @param from - Starting transform properties
   * @param to - Ending transform properties
   * @param progress - Interpolation progress (0-1)
   * @returns Interpolated transform properties
   */
  interpolate(
    from: TransformProperties,
    to: TransformProperties,
    progress: number,
  ): TransformProperties {
    const result: TransformProperties = {};

    // Helper for linear interpolation
    const lerp = (a: number | undefined, b: number | undefined, defaultVal: number): number => {
      const va = a ?? defaultVal;
      const vb = b ?? defaultVal;
      return va + (vb - va) * progress;
    };

    // Helper to determine if a property should be included in result
    const shouldInclude = (fromVal: number | undefined, toVal: number | undefined): boolean => {
      return fromVal !== undefined || toVal !== undefined;
    };

    // Translation
    if (shouldInclude(from.x, to.x)) {
      result.x = lerp(from.x, to.x, 0);
    }
    if (shouldInclude(from.y, to.y)) {
      result.y = lerp(from.y, to.y, 0);
    }
    if (shouldInclude(from.z, to.z)) {
      result.z = lerp(from.z, to.z, 0);
    }

    // Rotation (individual axes)
    if (shouldInclude(from.rotateX, to.rotateX)) {
      result.rotateX = lerp(from.rotateX, to.rotateX, 0);
    }
    if (shouldInclude(from.rotateY, to.rotateY)) {
      result.rotateY = lerp(from.rotateY, to.rotateY, 0);
    }
    if (shouldInclude(from.rotateZ, to.rotateZ)) {
      result.rotateZ = lerp(from.rotateZ, to.rotateZ, 0);
    }
    if (shouldInclude(from.rotate, to.rotate)) {
      result.rotate = lerp(from.rotate, to.rotate, 0);
    }

    // 3D Rotation using slerp
    if (from.rotate3d || to.rotate3d) {
      const fromR3d = from.rotate3d ?? { x: 0, y: 0, z: 1, angle: 0 };
      const toR3d = to.rotate3d ?? { x: 0, y: 0, z: 1, angle: 0 };

      const fromQ = axisAngleToQuaternion(fromR3d, fromR3d.angle);
      const toQ = axisAngleToQuaternion(toR3d, toR3d.angle);
      const interpolatedQ = slerp(fromQ, toQ, progress);
      result.rotate3d = quaternionToAxisAngle(interpolatedQ);
    }

    // Scale
    if (shouldInclude(from.scaleX, to.scaleX)) {
      result.scaleX = lerp(from.scaleX, to.scaleX, 1);
    }
    if (shouldInclude(from.scaleY, to.scaleY)) {
      result.scaleY = lerp(from.scaleY, to.scaleY, 1);
    }
    if (shouldInclude(from.scaleZ, to.scaleZ)) {
      result.scaleZ = lerp(from.scaleZ, to.scaleZ, 1);
    }
    if (shouldInclude(from.scale, to.scale)) {
      result.scale = lerp(from.scale, to.scale, 1);
    }

    // Skew
    if (shouldInclude(from.skewX, to.skewX)) {
      result.skewX = lerp(from.skewX, to.skewX, 0);
    }
    if (shouldInclude(from.skewY, to.skewY)) {
      result.skewY = lerp(from.skewY, to.skewY, 0);
    }

    // Perspective
    if (shouldInclude(from.perspective, to.perspective)) {
      result.perspective = lerp(from.perspective, to.perspective, 0);
    }

    // Transform origin (interpolate numeric values, keep strings)
    if (from.transformOrigin || to.transformOrigin) {
      result.transformOrigin = this.interpolateOrigin(
        from.transformOrigin,
        to.transformOrigin,
        progress,
      );
    }

    // Perspective origin
    if (from.perspectiveOrigin || to.perspectiveOrigin) {
      result.perspectiveOrigin = this.interpolateOrigin(
        from.perspectiveOrigin,
        to.perspectiveOrigin,
        progress,
      );
    }

    return result;
  }

  /**
   * Interpolate transform origin values
   */
  private interpolateOrigin(
    from: TransformOrigin | undefined,
    to: TransformOrigin | undefined,
    progress: number,
  ): TransformOrigin {
    const defaultOrigin: TransformOrigin = { x: '50%', y: '50%' };
    const fromO = from ?? defaultOrigin;
    const toO = to ?? defaultOrigin;

    const interpolateValue = (a: number | string, b: number | string): number | string => {
      // If both are numbers, interpolate
      if (typeof a === 'number' && typeof b === 'number') {
        return a + (b - a) * progress;
      }
      // If both are percentage strings, interpolate
      if (typeof a === 'string' && typeof b === 'string' && a.endsWith('%') && b.endsWith('%')) {
        const aNum = parseFloat(a);
        const bNum = parseFloat(b);
        return `${aNum + (bNum - aNum) * progress}%`;
      }
      // Otherwise, snap at 0.5
      return progress < 0.5 ? a : b;
    };

    return {
      x: interpolateValue(fromO.x, toO.x),
      y: interpolateValue(fromO.y, toO.y),
      z:
        fromO.z !== undefined || toO.z !== undefined
          ? (fromO.z ?? 0) + ((toO.z ?? 0) - (fromO.z ?? 0)) * progress
          : undefined,
    };
  }

  /**
   * Serialize transform origin to CSS string
   */
  serializeOrigin(origin: TransformOrigin): string {
    const x = typeof origin.x === 'number' ? `${origin.x}px` : origin.x;
    const y = typeof origin.y === 'number' ? `${origin.y}px` : origin.y;

    if (origin.z !== undefined) {
      return `${x} ${y} ${origin.z}px`;
    }
    return `${x} ${y}`;
  }
}

// ============================================================================
// TransformParser Class (ValueParser implementation)
// ============================================================================

/**
 * Parser for CSS transform values
 *
 * Implements the ValueParser interface for transform strings.
 * Uses TransformComposer internally for composition and decomposition.
 */
export class TransformParser implements ValueParser<TransformProperties> {
  readonly type = ValueType.Transform;

  private composer = new TransformComposer();

  /**
   * Detect if a value is a CSS transform string
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim().toLowerCase();

    // Check for 'none'
    if (trimmed === 'none') {
      return true;
    }

    // Check for transform functions
    return TRANSFORM_DETECT_REGEX.test(trimmed);
  }

  /**
   * Parse a CSS transform string
   */
  parse(value: unknown): ParsedValue<TransformProperties> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Transform, 'Value must be a string');
    }

    const trimmed = value.trim();

    if (trimmed.toLowerCase() === 'none' || trimmed === '') {
      return {
        type: ValueType.Transform,
        value: {},
        original: value,
      };
    }

    try {
      const props = this.composer.decompose(trimmed);
      return {
        type: ValueType.Transform,
        value: props,
        original: value,
      };
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Transform,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }
  }

  /**
   * Serialize transform properties back to CSS string
   */
  serialize(parsed: ParsedValue<TransformProperties>): string {
    return this.composer.compose(parsed.value);
  }

  /**
   * Interpolate between two transform property sets
   */
  interpolate(
    from: TransformProperties,
    to: TransformProperties,
    progress: number,
  ): TransformProperties {
    return this.composer.interpolate(from, to, progress);
  }

  /**
   * Get the internal composer instance
   */
  getComposer(): TransformComposer {
    return this.composer;
  }
}

/**
 * Default transform parser instance
 */
export const transformParser = new TransformParser();

/**
 * Default transform composer instance
 */
export const transformComposer = new TransformComposer();
