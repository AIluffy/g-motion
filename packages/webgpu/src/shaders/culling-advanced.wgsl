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
