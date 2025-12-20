/**
 * Batch Culling GPU Shader (Phase 1.3)
 *
 * GPU-accelerated entity visibility culling to reduce CPU-GPU data transfer.
 * Determines which entities need rendering based on version changes and status.
 */

// WGSL shader for entity culling
export const CULLING_SHADER = `
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
`;

// Advanced culling shader with frustum and temporal culling
export const ADVANCED_CULLING_SHADER = `
// Frustum planes for view culling (6 planes)
struct FrustumPlanes {
    left: vec4<f32>,
    right: vec4<f32>,
    top: vec4<f32>,
    bottom: vec4<f32>,
    near: vec4<f32>,
    far: vec4<f32>,
}

// Entity bounds for spatial culling
struct EntityBounds {
    centerX: f32,
    centerY: f32,
    centerZ: f32,
    radius: f32,        // Bounding sphere radius
}

// Extended render state with bounds
struct RenderStateEx {
    entityId: u32,
    version: u32,
    renderedVersion: u32,
    status: u32,
    rendererCode: u32,
    animationEndTime: f32,  // For temporal culling
    currentTime: f32,
    _pad: u32,
}

struct CullResultEx {
    entityId: u32,
    visible: u32,
    rendererCode: u32,
    outputIndex: u32,
    cullReason: u32,    // 0: visible, 1: version, 2: status, 3: frustum, 4: temporal
    _pad1: u32,
    _pad2: u32,
    _pad3: u32,
}

struct AtomicCounter {
    count: atomic<u32>,
}

@group(0) @binding(0) var<storage, read> renderStates: array<RenderStateEx>;
@group(0) @binding(1) var<storage, read> bounds: array<EntityBounds>;
@group(0) @binding(2) var<uniform> frustum: FrustumPlanes;
@group(0) @binding(3) var<storage, read_write> cullResults: array<CullResultEx>;
@group(0) @binding(4) var<storage, read_write> visibleCount: AtomicCounter;

// Test if sphere is inside frustum plane
fn sphereInsidePlane(center: vec3<f32>, radius: f32, plane: vec4<f32>) -> bool {
    let dist = dot(plane.xyz, center) + plane.w;
    return dist >= -radius;
}

// Test if bounding sphere is inside frustum
fn sphereInsideFrustum(center: vec3<f32>, radius: f32, f: FrustumPlanes) -> bool {
    return sphereInsidePlane(center, radius, f.left) &&
           sphereInsidePlane(center, radius, f.right) &&
           sphereInsidePlane(center, radius, f.top) &&
           sphereInsidePlane(center, radius, f.bottom) &&
           sphereInsidePlane(center, radius, f.near) &&
           sphereInsidePlane(center, radius, f.far);
}

// Advanced culling with frustum and temporal checks
@compute @workgroup_size(64)
fn cullEntitiesAdvanced(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&renderStates);

    if (index >= entityCount) {
        return;
    }

    let state = renderStates[index];
    let bound = bounds[index];

    var cullReason = 0u;
    var shouldRender = true;

    // Check 1: Version change
    if (state.version == state.renderedVersion) {
        shouldRender = false;
        cullReason = 1u;
    }

    // Check 2: Status (must be Running or Paused)
    if (shouldRender && state.status != 1u && state.status != 2u) {
        shouldRender = false;
        cullReason = 2u;
    }

    // Check 3: Frustum culling (if bounds available)
    if (shouldRender && bound.radius > 0.0) {
        let center = vec3<f32>(bound.centerX, bound.centerY, bound.centerZ);
        if (!sphereInsideFrustum(center, bound.radius, frustum)) {
            shouldRender = false;
            cullReason = 3u;
        }
    }

    // Check 4: Temporal culling (animation finished)
    if (shouldRender && state.animationEndTime > 0.0 && state.currentTime > state.animationEndTime) {
        shouldRender = false;
        cullReason = 4u;
    }

    // Write result
    cullResults[index].entityId = state.entityId;
    cullResults[index].visible = select(0u, 1u, shouldRender);
    cullResults[index].rendererCode = state.rendererCode;
    cullResults[index].cullReason = cullReason;

    if (shouldRender) {
        let outputIdx = atomicAdd(&visibleCount.count, 1u);
        cullResults[index].outputIndex = outputIdx;
    } else {
        cullResults[index].outputIndex = 0xFFFFFFFFu;
    }
}
`;

// Stream compaction shader to pack visible entities
export const COMPACTION_SHADER = `
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
`;

/**
 * RenderState data layout for CPU packing
 */
export interface RenderStateData {
  entityId: number;
  version: number;
  renderedVersion: number;
  status: number;
  rendererCode: number;
}

/**
 * Extended RenderState with bounds for advanced culling
 */
export interface RenderStateExData extends RenderStateData {
  animationEndTime?: number;
  currentTime?: number;
  bounds?: {
    centerX: number;
    centerY: number;
    centerZ: number;
    radius: number;
  };
}

/**
 * Culling result from GPU
 */
export interface CullResultData {
  entityId: number;
  visible: boolean;
  rendererCode: number;
  outputIndex: number;
  cullReason?: number;
}

// Data layout constants
export const RENDER_STATE_STRIDE = 8; // 8 u32s per state
export const RENDER_STATE_EX_STRIDE = 8; // 8 values per extended state
export const ENTITY_BOUNDS_STRIDE = 4; // 4 floats per bounds
export const CULL_RESULT_STRIDE = 4; // 4 u32s per result
export const CULL_RESULT_EX_STRIDE = 8; // 8 u32s per extended result
export const COMPACTED_ENTITY_STRIDE = 4; // 4 u32s per compacted entity

/**
 * Pack RenderState data for GPU upload
 */
export function packRenderStates(states: RenderStateData[]): Uint32Array {
  const data = new Uint32Array(states.length * RENDER_STATE_STRIDE);
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    const offset = i * RENDER_STATE_STRIDE;
    data[offset + 0] = s.entityId;
    data[offset + 1] = s.version;
    data[offset + 2] = s.renderedVersion;
    data[offset + 3] = s.status;
    data[offset + 4] = s.rendererCode;
    data[offset + 5] = 0; // padding
    data[offset + 6] = 0; // padding
    data[offset + 7] = 0; // padding
  }
  return data;
}

/**
 * Unpack culling results from GPU
 */
export function unpackCullResults(data: Uint32Array, count: number): CullResultData[] {
  const results: CullResultData[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * CULL_RESULT_STRIDE;
    results.push({
      entityId: data[offset + 0],
      visible: data[offset + 1] === 1,
      rendererCode: data[offset + 2],
      outputIndex: data[offset + 3],
    });
  }
  return results;
}

/**
 * Get visible entity IDs from culling results
 */
export function getVisibleEntityIds(results: CullResultData[]): number[] {
  return results.filter((r) => r.visible).map((r) => r.entityId);
}

/**
 * Group visible entities by renderer code
 */
export function groupByRenderer(
  results: CullResultData[],
): Map<number, { entityId: number; outputIndex: number }[]> {
  const groups = new Map<number, { entityId: number; outputIndex: number }[]>();

  for (const r of results) {
    if (!r.visible) continue;

    let group = groups.get(r.rendererCode);
    if (!group) {
      group = [];
      groups.set(r.rendererCode, group);
    }
    group.push({ entityId: r.entityId, outputIndex: r.outputIndex });
  }

  return groups;
}
