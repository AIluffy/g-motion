// SoA output buffers
@group(0) @binding(0) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(1) var<storage, read> channelStride: u32;
@group(0) @binding(2) var<storage, read_write> xValues: array<f32>;
@group(0) @binding(3) var<storage, read_write> yValues: array<f32>;
@group(0) @binding(4) var<storage, read_write> rotationValues: array<f32>;
@group(0) @binding(5) var<storage, read_write> scaleXValues: array<f32>;
@group(0) @binding(6) var<storage, read_write> scaleYValues: array<f32>;
@group(0) @binding(7) var<storage, read_write> opacityValues: array<f32>;

// Transpose AoS to SoA for SIMD-friendly CPU access
@compute @workgroup_size(64)
fn transposeToSoA(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&xValues);

    if (index >= entityCount) {
        return;
    }

    let baseOffset = index * channelStride;

    xValues[index] = rawOutputs[baseOffset];
    yValues[index] = rawOutputs[baseOffset + 1u];
    rotationValues[index] = rawOutputs[baseOffset + 2u];
    scaleXValues[index] = rawOutputs[baseOffset + 3u];
    scaleYValues[index] = rawOutputs[baseOffset + 4u];
    opacityValues[index] = rawOutputs[baseOffset + 5u];
}
