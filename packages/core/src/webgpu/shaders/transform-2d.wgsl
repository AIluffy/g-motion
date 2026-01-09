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
