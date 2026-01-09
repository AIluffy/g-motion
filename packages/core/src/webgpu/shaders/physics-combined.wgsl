const KIND_SPRING: f32 = 0.0;
const KIND_INERTIA: f32 = 1.0;

struct PhysicsState {
    position: f32,          // 0
    velocity: f32,          // 1
    targetValue: f32,       // 2 (spring target / inertia toValue)
    fromValue: f32,         // 3 (inertia fromValue)
    p0: f32,                // 4 (spring stiffness / inertia timeConstantMs)
    p1: f32,                // 5 (spring damping / inertia minBound)
    p2: f32,                // 6 (spring mass / inertia maxBound)
    p3: f32,                // 7 (spring restSpeed / inertia restSpeed)
    p4: f32,                // 8 (spring restDelta / inertia restDelta)
    p5: f32,                // 9 (inertia clamp 0/1)
    p6: f32,                // 10 (inertia bounceEnabled 0/1)
    p7: f32,                // 11 (inertia bounceStiffness)
    p8: f32,                // 12 (inertia bounceDamping)
    p9: f32,                // 13 (inertia bounceMass)
    kind: f32,              // 14
    mode: f32,              // 15 (inertia: 0 decay, 1 bounce)
}

struct SimParams {
    deltaMs: f32,
    deltaSec: f32,
    maxVelocity: f32,
    _pad: f32,
}

@group(0) @binding(0) var<storage, read_write> states: array<PhysicsState>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var<storage, read_write> outputs: array<f32>;
@group(0) @binding(3) var<storage, read_write> finished: array<u32>;

fn isFinite(value: f32) -> bool {
    return (value - value) == 0.0;
}

fn springStep(state: ptr<function, PhysicsState>, dtSec: f32, maxVel: f32) -> bool {
    let displacement = (*state).position - (*state).targetValue;
    let force = -(*state).p0 * displacement - (*state).p1 * (*state).velocity;
    let acceleration = force / max((*state).p2, 0.001);

    (*state).velocity = clamp((*state).velocity + acceleration * dtSec, -maxVel, maxVel);
    (*state).position = (*state).position + (*state).velocity * dtSec;

    return abs((*state).velocity) < (*state).p3 && abs(displacement) < (*state).p4;
}

fn inertiaStep(state: ptr<function, PhysicsState>, dtMs: f32, dtSec: f32) -> bool {
    let timeConstant = max((*state).p0, 0.001);
    let restSpeed = (*state).p3;
    let restDelta = (*state).p4;
    let clampOn = (*state).p5 >= 0.5;
    let bounceOn = (*state).p6 >= 0.5;
    let minB = (*state).p1;
    let maxB = (*state).p2;

    let hasMin = isFinite(minB);
    let hasMax = isFinite(maxB);

    if ((*state).mode < 0.5) {
        let decayFactor = exp(-dtMs / timeConstant);
        (*state).velocity = (*state).velocity * decayFactor;
        (*state).position = (*state).position + (*state).velocity * dtSec;

        var hit = false;
        var boundary = (*state).position;

        if (hasMax && (*state).position >= maxB) {
            hit = true;
            boundary = maxB;
        } else if (hasMin && (*state).position <= minB) {
            hit = true;
            boundary = minB;
        }

        if (hit) {
            (*state).position = boundary;
            if (clampOn || !bounceOn) {
                (*state).velocity = 0.0;
            } else {
                (*state).mode = 1.0;
            }
        }

        return abs((*state).velocity) < restSpeed;
    }

    var springTarget = (*state).position;
    if (hasMax && (*state).position >= maxB - restDelta) {
        springTarget = maxB;
    } else if (hasMin && (*state).position <= minB + restDelta) {
        springTarget = minB;
    }

    let displacement = (*state).position - springTarget;
    let force = -(*state).p7 * displacement - (*state).p8 * (*state).velocity;
    let acceleration = force / max((*state).p9, 0.001);

    (*state).velocity = (*state).velocity + acceleration * dtSec;
    (*state).position = (*state).position + (*state).velocity * dtSec;

    let isSettled = abs((*state).velocity) < restSpeed && abs(displacement) < restDelta;
    if (isSettled) {
        (*state).mode = 0.0;
        (*state).velocity = 0.0;
        (*state).position = springTarget;
    }
    return isSettled;
}

@compute @workgroup_size(64)
fn updatePhysics(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= arrayLength(&states)) {
        return;
    }

    var state = states[index];
    var isFinished = false;

    if (state.kind < 0.5) {
        isFinished = springStep(&state, params.deltaSec, params.maxVelocity);
        if (isFinished) {
            state.position = state.targetValue;
            state.velocity = 0.0;
        }
    } else {
        isFinished = inertiaStep(&state, params.deltaMs, params.deltaSec);
        if (isFinished) {
            state.velocity = 0.0;
        }
    }

    states[index] = state;
    outputs[index] = state.position;
    finished[index] = select(0u, 1u, isFinished);
}
