struct FrustumPlanes {
    left: vec4<f32>,
    right: vec4<f32>,
    top: vec4<f32>,
    bottom: vec4<f32>,
    near: vec4<f32>,
    far: vec4<f32>,
}

struct EntityBounds {
    centerX: f32,
    centerY: f32,
    centerZ: f32,
    radius: f32,
}

struct RenderStateEx {
    entityId: u32,
    version: u32,
    renderedVersion: u32,
    status: u32,
    rendererCode: u32,
    animationEndTime: f32,
    currentTime: f32,
    _pad: u32,
}

struct AtomicCounter {
    count: atomic<u32>,
}

struct Params {
    rawStride: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(0) var<storage, read> renderStates: array<RenderStateEx>;
@group(0) @binding(1) var<storage, read> bounds: array<EntityBounds>;
@group(0) @binding(2) var<uniform> frustum: FrustumPlanes;
@group(0) @binding(3) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(4) var<storage, read_write> compactedOutputs: array<f32>;
@group(0) @binding(5) var<storage, read_write> compactedEntityIds: array<u32>;
@group(0) @binding(6) var<storage, read_write> visibleCount: AtomicCounter;
@group(0) @binding(7) var<uniform> params: Params;

fn sphereInsidePlane(center: vec3<f32>, radius: f32, plane: vec4<f32>) -> bool {
    let dist = dot(plane.xyz, center) + plane.w;
    return dist >= -radius;
}

fn sphereInsideFrustum(center: vec3<f32>, radius: f32, f: FrustumPlanes) -> bool {
    return sphereInsidePlane(center, radius, f.left) &&
           sphereInsidePlane(center, radius, f.right) &&
           sphereInsidePlane(center, radius, f.top) &&
           sphereInsidePlane(center, radius, f.bottom) &&
           sphereInsidePlane(center, radius, f.near) &&
           sphereInsidePlane(center, radius, f.far);
}

@compute @workgroup_size(64)
fn cullAndCompact(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&renderStates);
    if (index >= entityCount) {
        return;
    }

    let state = renderStates[index];
    let bound = bounds[index];

    var shouldRender = true;

    if (state.version == state.renderedVersion) {
        shouldRender = false;
    }

    if (shouldRender && state.status != 1u && state.status != 2u) {
        shouldRender = false;
    }

    if (shouldRender && bound.radius > 0.0) {
        let center = vec3<f32>(bound.centerX, bound.centerY, bound.centerZ);
        if (!sphereInsideFrustum(center, bound.radius, frustum)) {
            shouldRender = false;
        }
    }

    if (shouldRender && state.animationEndTime > 0.0 && state.currentTime > state.animationEndTime) {
        shouldRender = false;
    }

    if (!shouldRender) {
        return;
    }

    let outputIdx = atomicAdd(&visibleCount.count, 1u);
    compactedEntityIds[outputIdx] = state.entityId;

    let stride = params.rawStride;
    let srcBase = index * stride;
    let dstBase = outputIdx * stride;
    var j: u32 = 0u;
    loop {
        if (j >= stride) { break; }
        let src = srcBase + j;
        let dst = dstBase + j;
        if (src < arrayLength(&rawOutputs) && dst < arrayLength(&compactedOutputs)) {
            compactedOutputs[dst] = rawOutputs[src];
        }
        j = j + 1u;
    }
}
