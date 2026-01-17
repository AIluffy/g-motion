/**
 * Quaternion Math Utilities
 *
 * Mathematical operations for quaternion-based 3D rotation interpolation.
 *
 * @module values/parsers/transform/quaternion
 */

import type { Quaternion, Rotate3D } from './types';

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
