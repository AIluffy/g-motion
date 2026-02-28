// Inertia Physics GPU Shader
// GPU-accelerated inertia/momentum simulations with optional boundary bounce.
// This shader provides smooth deceleration with configurable friction and
// optional spring-based bounce when hitting boundaries.

// Inertia state per entity per channel
struct InertiaState {
    position: f32,
    velocity: f32,
    bounceVelocity: f32,
    inBounce: f32,
    boundTarget: f32,
    timeConstantMs: f32,
    minBound: f32,
    maxBound: f32,
    clamp: f32,
    bounceEnabled: f32,
    bounceStiffness: f32,
    bounceDamping: f32,
    bounceMass: f32,
    restSpeed: f32,
    restDelta: f32,
    _pad: f32,
}

struct SimParams {
    deltaTimeMs: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var<storage, read_write> inertias: array<InertiaState>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var<storage, read_write> outputs: array<f32>;
@group(0) @binding(3) var<storage, read_write> stopped: array<u32>;

@compute @workgroup_size(64)
fn updateInertia(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let count = arrayLength(&inertias);

    if (index >= count) {
        return;
    }

    var state = inertias[index];
    let dtMs = params.deltaTimeMs;
    let dt = dtMs / 1000.0;

    var isStopped = false;
    if (state.inBounce < 0.5) {
        // Decay phase - exponential velocity decay
        let decayFactor = exp(-dtMs / max(state.timeConstantMs, 0.001));
        state.velocity = state.velocity * decayFactor;
        state.position = state.position + state.velocity * dt;

        // Check for boundary hits
        var hitBoundary = false;
        var boundaryValue = 0.0;
        if (state.minBound < state.maxBound) {
            if (state.position >= state.maxBound) {
                hitBoundary = true;
                boundaryValue = state.maxBound;
            } else if (state.position <= state.minBound) {
                hitBoundary = true;
                boundaryValue = state.minBound;
            }
        }

        if (hitBoundary) {
            state.position = boundaryValue;
            state.boundTarget = boundaryValue;

            if (state.clamp >= 0.5 || state.bounceEnabled < 0.5) {
                // Clamp mode - stop at boundary
                state.velocity = 0.0;
                state.bounceVelocity = 0.0;
                state.inBounce = 0.0;
                isStopped = true;
            } else {
                // Bounce mode - switch to spring physics
                state.inBounce = 1.0;
                state.bounceVelocity = state.velocity;
                state.velocity = 0.0;
            }
        }
    } else {
        // Bounce phase - spring physics at boundary
        let displacement = state.position - state.boundTarget;
        let force = -state.bounceStiffness * displacement - state.bounceDamping * state.bounceVelocity;
        let acceleration = force / max(state.bounceMass, 0.001);

        state.bounceVelocity = state.bounceVelocity + acceleration * dt;
        state.position = state.position + state.bounceVelocity * dt;

        // Check if bounce has settled
        if (abs(state.bounceVelocity) < state.restSpeed && abs(displacement) < state.restDelta) {
            state.inBounce = 0.0;
            state.bounceVelocity = 0.0;
            state.velocity = 0.0;
            state.position = state.boundTarget;
            isStopped = true;
        }
    }

    stopped[index] = select(0u, 1u, isStopped);

    inertias[index] = state;
    outputs[index] = state.position;
}
