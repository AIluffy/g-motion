/**
 * Transform Matrix GPU Shader (Phase 1.2)
 *
 * Computes 2D/3D transform matrices on the GPU for high-performance
 * animation rendering. Supports translate, scale, rotate operations.
 */

// WGSL shader for 2D transform matrix computation
export const TRANSFORM_2D_SHADER = `
// Transform input data
struct Transform2D {
    x: f32,
    y: f32,
    scaleX: f32,
    scaleY: f32,
    rotation: f32,  // radians
    originX: f32,   // transform origin X (0-1)
    originY: f32,   // transform origin Y (0-1)
    _pad: f32,      // padding for alignment
}

// 3x3 matrix output (row-major, 9 floats + 3 padding = 12 floats for alignment)
struct Matrix3x3 {
    m00: f32, m01: f32, m02: f32, _p0: f32,
    m10: f32, m11: f32, m12: f32, _p1: f32,
    m20: f32, m21: f32, m22: f32, _p2: f32,
}

@group(0) @binding(0) var<storage, read> transforms: array<Transform2D>;
@group(0) @binding(1) var<storage, read_write> matrices: array<Matrix3x3>;

// Compute 2D transform matrix: T * R * S (translate * rotate * scale)
// With transform origin support
@compute @workgroup_size(64)
fn computeTransform2D(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= arrayLength(&transforms)) {
        return;
    }

    let t = transforms[index];

    let cos_r = cos(t.rotation);
    let sin_r = sin(t.rotation);

    // Build matrix: translate(-origin) * scale * rotate * translate(origin) * translate(x,y)
    // Simplified to single matrix multiplication

    // Scale and rotate components
    let a = t.scaleX * cos_r;
    let b = -t.scaleX * sin_r;
    let c = t.scaleY * sin_r;
    let d = t.scaleY * cos_r;

    // Translation with origin offset
    let ox = t.originX;
    let oy = t.originY;
    let tx = t.x + ox - (a * ox + b * oy);
    let ty = t.y + oy - (c * ox + d * oy);

    // Output matrix (row-major)
    // | a  b  tx |
    // | c  d  ty |
    // | 0  0  1  |
    matrices[index] = Matrix3x3(
        a, b, tx, 0.0,
        c, d, ty, 0.0,
        0.0, 0.0, 1.0, 0.0
    );
}
`;

// WGSL shader for 3D transform matrix computation
export const TRANSFORM_3D_SHADER = `
// Transform input data for 3D
struct Transform3D {
    x: f32,
    y: f32,
    z: f32,
    scaleX: f32,
    scaleY: f32,
    scaleZ: f32,
    rotateX: f32,   // radians
    rotateY: f32,   // radians
    rotateZ: f32,   // radians
    originX: f32,
    originY: f32,
    originZ: f32,
}

// 4x4 matrix output (row-major, 16 floats)
struct Matrix4x4 {
    m00: f32, m01: f32, m02: f32, m03: f32,
    m10: f32, m11: f32, m12: f32, m13: f32,
    m20: f32, m21: f32, m22: f32, m23: f32,
    m30: f32, m31: f32, m32: f32, m33: f32,
}

@group(0) @binding(0) var<storage, read> transforms: array<Transform3D>;
@group(0) @binding(1) var<storage, read_write> matrices: array<Matrix4x4>;

// Compute 3D transform matrix with Euler angles (ZYX order)
@compute @workgroup_size(64)
fn computeTransform3D(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= arrayLength(&transforms)) {
        return;
    }

    let t = transforms[index];

    // Precompute trig values
    let cx = cos(t.rotateX);
    let sx = sin(t.rotateX);
    let cy = cos(t.rotateY);
    let sy = sin(t.rotateY);
    let cz = cos(t.rotateZ);
    let sz = sin(t.rotateZ);

    // Rotation matrix (ZYX Euler order)
    // Rz * Ry * Rx
    let r00 = cy * cz;
    let r01 = cz * sx * sy - cx * sz;
    let r02 = cx * cz * sy + sx * sz;

    let r10 = cy * sz;
    let r11 = cx * cz + sx * sy * sz;
    let r12 = -cz * sx + cx * sy * sz;

    let r20 = -sy;
    let r21 = cy * sx;
    let r22 = cx * cy;

    // Apply scale
    let m00 = r00 * t.scaleX;
    let m01 = r01 * t.scaleY;
    let m02 = r02 * t.scaleZ;

    let m10 = r10 * t.scaleX;
    let m11 = r11 * t.scaleY;
    let m12 = r12 * t.scaleZ;

    let m20 = r20 * t.scaleX;
    let m21 = r21 * t.scaleY;
    let m22 = r22 * t.scaleZ;

    // Translation with origin offset
    let ox = t.originX;
    let oy = t.originY;
    let oz = t.originZ;

    let tx = t.x + ox - (m00 * ox + m01 * oy + m02 * oz);
    let ty = t.y + oy - (m10 * ox + m11 * oy + m12 * oz);
    let tz = t.z + oz - (m20 * ox + m21 * oy + m22 * oz);

    // Output 4x4 matrix
    matrices[index] = Matrix4x4(
        m00, m01, m02, tx,
        m10, m11, m12, ty,
        m20, m21, m22, tz,
        0.0, 0.0, 0.0, 1.0
    );
}
`;

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
