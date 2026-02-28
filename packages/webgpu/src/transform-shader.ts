/**
 * Transform Matrix GPU Shader (Phase 1.2)
 *
 * Computes 2D/3D transform matrices on the GPU for high-performance
 * animation rendering. Supports translate, scale, rotate operations.
 */

import transform2DShaderCode from './shaders/transform-2d.wgsl?raw';
import transform3DShaderCode from './shaders/transform-3d.wgsl?raw';

// WGSL shader for 2D transform matrix computation
export const TRANSFORM_2D_SHADER = transform2DShaderCode;

// WGSL shader for 3D transform matrix computation
export const TRANSFORM_3D_SHADER = transform3DShaderCode;

// Combined shader with both 2D and 3D support
export const TRANSFORM_COMBINED_SHADER = `
${TRANSFORM_2D_SHADER}

// Additional entry point for 3D (requires separate pipeline)
`;

/**
 * Transform2D data layout for CPU packing
 */
export interface Transform2DData {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  originX?: number;
  originY?: number;
}

/**
 * Transform3D data layout for CPU packing
 */
export interface Transform3DData {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  originX?: number;
  originY?: number;
  originZ?: number;
}

// Data layout constants
export const TRANSFORM_2D_STRIDE = 8; // 8 floats per transform
export const TRANSFORM_3D_STRIDE = 12; // 12 floats per transform
export const MATRIX_3X3_STRIDE = 12; // 12 floats (9 + 3 padding)
export const MATRIX_4X4_STRIDE = 16; // 16 floats

/**
 * Pack Transform2D data for GPU upload
 */
export function packTransform2D(transforms: Transform2DData[]): Float32Array {
  const data = new Float32Array(transforms.length * TRANSFORM_2D_STRIDE);
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    const offset = i * TRANSFORM_2D_STRIDE;
    data[offset + 0] = t.x;
    data[offset + 1] = t.y;
    data[offset + 2] = t.scaleX;
    data[offset + 3] = t.scaleY;
    data[offset + 4] = t.rotation;
    data[offset + 5] = t.originX ?? 0;
    data[offset + 6] = t.originY ?? 0;
    data[offset + 7] = 0; // padding
  }
  return data;
}

/**
 * Pack Transform3D data for GPU upload
 */
export function packTransform3D(transforms: Transform3DData[]): Float32Array {
  const data = new Float32Array(transforms.length * TRANSFORM_3D_STRIDE);
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    const offset = i * TRANSFORM_3D_STRIDE;
    data[offset + 0] = t.x;
    data[offset + 1] = t.y;
    data[offset + 2] = t.z;
    data[offset + 3] = t.scaleX;
    data[offset + 4] = t.scaleY;
    data[offset + 5] = t.scaleZ;
    data[offset + 6] = t.rotateX;
    data[offset + 7] = t.rotateY;
    data[offset + 8] = t.rotateZ;
    data[offset + 9] = t.originX ?? 0;
    data[offset + 10] = t.originY ?? 0;
    data[offset + 11] = t.originZ ?? 0;
  }
  return data;
}

/**
 * Unpack 3x3 matrix from GPU output
 */
export function unpackMatrix3x3(data: Float32Array, index: number): number[] {
  const offset = index * MATRIX_3X3_STRIDE;
  return [
    data[offset + 0],
    data[offset + 1],
    data[offset + 2],
    data[offset + 4],
    data[offset + 5],
    data[offset + 6],
    data[offset + 8],
    data[offset + 9],
    data[offset + 10],
  ];
}

/**
 * Unpack 4x4 matrix from GPU output
 */
export function unpackMatrix4x4(data: Float32Array, index: number): number[] {
  const offset = index * MATRIX_4X4_STRIDE;
  return Array.from(data.subarray(offset, offset + 16));
}
