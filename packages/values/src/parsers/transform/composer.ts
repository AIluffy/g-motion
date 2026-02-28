/**
 * Transform Composer
 *
 * Handles composition of individual transform properties into CSS transform
 * strings, decomposition of CSS transforms back to properties, and
 * interpolation between transform states.
 *
 * @module values/parsers/transform/composer
 */

import type { TransformProperties, TransformOrigin } from './types';
import { parseTransformString } from './utils';
import { axisAngleToQuaternion, quaternionToAxisAngle, slerp } from './quaternion';
import { lerp } from '@g-motion/shared';

/**
 * Transform composer for independent transform properties
 */
export class TransformComposer {
  /**
   * Compose individual properties into CSS transform string
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
   */
  interpolate(
    from: TransformProperties,
    to: TransformProperties,
    progress: number,
  ): TransformProperties {
    const result: TransformProperties = {};

    // Helper to determine if a property should be included in result
    const shouldInclude = (fromVal: number | undefined, toVal: number | undefined): boolean => {
      return fromVal !== undefined || toVal !== undefined;
    };

    // Translation
    if (shouldInclude(from.x, to.x)) {
      result.x = lerp(from.x ?? 0, to.x ?? 0, progress);
    }

    if (shouldInclude(from.y, to.y)) {
      result.y = lerp(from.y ?? 0, to.y ?? 0, progress);
    }

    if (shouldInclude(from.z, to.z)) {
      result.z = lerp(from.z ?? 0, to.z ?? 0, progress);
    }

    // Rotation (3D)
    if (shouldInclude(from.rotateX, to.rotateX)) {
      result.rotateX = lerp(from.rotateX ?? 0, to.rotateX ?? 0, progress);
    }

    if (shouldInclude(from.rotateY, to.rotateY)) {
      result.rotateY = lerp(from.rotateY ?? 0, to.rotateY ?? 0, progress);
    }

    if (shouldInclude(from.rotateZ, to.rotateZ)) {
      result.rotateZ = lerp(from.rotateZ ?? 0, to.rotateZ ?? 0, progress);
    }

    if (shouldInclude(from.rotate, to.rotate)) {
      result.rotate = lerp(from.rotate ?? 0, to.rotate ?? 0, progress);
    }
    if (shouldInclude(from.y, to.y)) {
      result.y = lerp(from.y ?? 0, to.y ?? 0, progress);
    }
    if (shouldInclude(from.z, to.z)) {
      result.z = lerp(from.z ?? 0, to.z ?? 0, progress);
    }

    // Rotation (individual axes)
    if (shouldInclude(from.rotateX, to.rotateX)) {
      result.rotateX = lerp(from.rotateX ?? 0, to.rotateX ?? 0, progress);
    }
    if (shouldInclude(from.rotateY, to.rotateY)) {
      result.rotateY = lerp(from.rotateY ?? 0, to.rotateY ?? 0, progress);
    }
    if (shouldInclude(from.rotateZ, to.rotateZ)) {
      result.rotateZ = lerp(from.rotateZ ?? 0, to.rotateZ ?? 0, progress);
    }
    if (shouldInclude(from.rotate, to.rotate)) {
      result.rotate = lerp(from.rotate ?? 0, to.rotate ?? 0, progress);
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
      result.scaleX = lerp(from.scaleX ?? 1, to.scaleX ?? 1, progress);
    }

    if (shouldInclude(from.scaleY, to.scaleY)) {
      result.scaleY = lerp(from.scaleY ?? 1, to.scaleY ?? 1, progress);
    }

    if (shouldInclude(from.scaleZ, to.scaleZ)) {
      result.scaleZ = lerp(from.scaleZ ?? 1, to.scaleZ ?? 1, progress);
    }

    if (shouldInclude(from.scale, to.scale)) {
      result.scale = lerp(from.scale ?? 1, to.scale ?? 1, progress);
    }

    // Skew
    if (shouldInclude(from.skewX, to.skewX)) {
      result.skewX = lerp(from.skewX ?? 0, to.skewX ?? 0, progress);
    }

    if (shouldInclude(from.skewY, to.skewY)) {
      result.skewY = lerp(from.skewY ?? 0, to.skewY ?? 0, progress);
    }

    // Perspective
    if (shouldInclude(from.perspective, to.perspective)) {
      result.perspective = lerp(from.perspective ?? 0, to.perspective ?? 0, progress);
    }
    if (shouldInclude(from.scaleY, to.scaleY)) {
      result.scaleY = lerp(from.scaleY ?? 1, to.scaleY ?? 1, progress);
    }
    if (shouldInclude(from.scaleZ, to.scaleZ)) {
      result.scaleZ = lerp(from.scaleZ ?? 1, to.scaleZ ?? 1, progress);
    }
    if (shouldInclude(from.scale, to.scale)) {
      result.scale = lerp(from.scale ?? 1, to.scale ?? 1, progress);
    }

    // Skew
    if (shouldInclude(from.skewX, to.skewX)) {
      result.skewX = lerp(from.skewX ?? 0, to.skewX ?? 0, progress);
    }
    if (shouldInclude(from.skewY, to.skewY)) {
      result.skewY = lerp(from.skewY ?? 0, to.skewY ?? 0, progress);
    }

    // Perspective
    if (shouldInclude(from.perspective, to.perspective)) {
      result.perspective = lerp(from.perspective ?? 0, to.perspective ?? 0, progress);
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
