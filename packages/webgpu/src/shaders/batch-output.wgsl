// Entity output descriptor
struct EntityOutput {
    entityId: u32,
    channelOffset: u32, // Offset in output array
    channelCount: u32,  // Number of channels for this entity
    _pad: u32,
}

// Interleaved output for cache-friendly access
struct InterleavedOutput {
    entityId: u32,
    x: f32,
    y: f32,
    rotation: f32,
    scaleX: f32,
    scaleY: f32,
    opacity: f32,
    _pad: f32,
}

@group(0) @binding(0) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(1) var<storage, read> entityDescs: array<EntityOutput>;
@group(0) @binding(2) var<storage, read_write> interleavedOutputs: array<InterleavedOutput>;

// Pack outputs into interleaved format for efficient CPU consumption
@compute @workgroup_size(64)
fn packInterleavedOutputs(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&entityDescs);

    if (index >= entityCount) {
        return;
    }

    let desc = entityDescs[index];
    let offset = desc.channelOffset;
    let count = desc.channelCount;

    var output: InterleavedOutput;
    output.entityId = desc.entityId;

    // Map channels to interleaved output (assumes standard channel order)
    output.x = select(0.0, rawOutputs[offset], count > 0u);
    output.y = select(0.0, rawOutputs[offset + 1u], count > 1u);
    output.rotation = select(0.0, rawOutputs[offset + 2u], count > 2u);
    output.scaleX = select(1.0, rawOutputs[offset + 3u], count > 3u);
    output.scaleY = select(1.0, rawOutputs[offset + 4u], count > 4u);
    output.opacity = select(1.0, rawOutputs[offset + 5u], count > 5u);

    interleavedOutputs[index] = output;
}
