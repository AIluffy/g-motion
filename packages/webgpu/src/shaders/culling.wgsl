// Entity render state for culling decisions
struct RenderState {
    entityId: u32,
    version: u32,
    renderedVersion: u32,
    status: u32,        // 0: Idle, 1: Running, 2: Paused, 3: Finished
    rendererCode: u32,
    _pad1: u32,
    _pad2: u32,
    _pad3: u32,
}

// Culling result per entity
struct CullResult {
    entityId: u32,
    visible: u32,       // 1 = needs render, 0 = skip
    rendererCode: u32,
    outputIndex: u32,   // Compacted index for visible entities
}

// Atomic counter for compaction
struct AtomicCounter {
    count: atomic<u32>,
}

@group(0) @binding(0) var<storage, read> renderStates: array<RenderState>;
@group(0) @binding(1) var<storage, read_write> cullResults: array<CullResult>;
@group(0) @binding(2) var<storage, read_write> visibleCount: AtomicCounter;

// Phase 1: Determine visibility for each entity
@compute @workgroup_size(64)
fn cullEntities(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&renderStates);

    if (index >= entityCount) {
        return;
    }

    let state = renderStates[index];

    // Entity is visible if:
    // 1. Version differs from renderedVersion (needs update)
    // 2. Status is Running (1) or Paused (2)
    let versionChanged = state.version != state.renderedVersion;
    let isActive = state.status == 1u || state.status == 2u;
    let shouldRender = versionChanged && isActive;

    // Write result
    cullResults[index].entityId = state.entityId;
    cullResults[index].visible = select(0u, 1u, shouldRender);
    cullResults[index].rendererCode = state.rendererCode;

    // Atomically increment visible count and get compacted index
    if (shouldRender) {
        let outputIdx = atomicAdd(&visibleCount.count, 1u);
        cullResults[index].outputIndex = outputIdx;
    } else {
        cullResults[index].outputIndex = 0xFFFFFFFFu; // Invalid index
    }
}
