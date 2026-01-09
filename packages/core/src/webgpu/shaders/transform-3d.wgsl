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
