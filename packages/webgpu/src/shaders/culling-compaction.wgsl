struct CullResult {
    entityId: u32,
    visible: u32,
    rendererCode: u32,
    outputIndex: u32,
}

struct CompactedEntity {
    entityId: u32,
    rendererCode: u32,
    originalIndex: u32,
    _pad: u32,
}

@group(0) @binding(0) var<storage, read> cullResults: array<CullResult>;
@group(0) @binding(1) var<storage, read_write> compacted: array<CompactedEntity>;

// Compact visible entities into contiguous array
@compute @workgroup_size(64)
fn compactVisible(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&cullResults);

    if (index >= entityCount) {
        return;
    }

    let result = cullResults[index];

    if (result.visible == 1u && result.outputIndex != 0xFFFFFFFFu) {
        compacted[result.outputIndex] = CompactedEntity(
            result.entityId,
            result.rendererCode,
            index,
            0u
        );
    }
}
