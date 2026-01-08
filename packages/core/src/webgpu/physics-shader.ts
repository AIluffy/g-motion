/**
 * Physics GPU Shader (Phase 2.1)
 *
 * GPU-accelerated physics simulations for Spring and Inertia animations.
 * Provides smooth, physically-based motion with configurable parameters.
 */

// WGSL shader for Spring physics
export const SPRING_SHADER = `
// Spring state per entity per channel
struct SpringState {
    position: f32,      // Current position
    velocity: f32,      // Current velocity
    targetValue: f32,   // Target position
    stiffness: f32,     // Spring stiffness (k)
    damping: f32,       // Damping coefficient (c)
    mass: f32,          // Mass (m)
    restDelta: f32,
    restSpeed: f32,
}

// Simulation parameters
struct SimParams {
    deltaTime: f32,     // Time step in seconds
    maxVelocity: f32,   // Velocity clamp
    settleThreshold: f32, // Threshold for considering spring settled
    _pad: f32,
}

@group(0) @binding(0) var<storage, read_write> springs: array<SpringState>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var<storage, read_write> outputs: array<f32>;
@group(0) @binding(3) var<storage, read_write> settled: array<u32>; // 1 if settled, 0 if active

// Semi-implicit Euler integration for spring physics
// More stable than explicit Euler for stiff springs
@compute @workgroup_size(64)
fn updateSprings(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let springCount = arrayLength(&springs);

    if (index >= springCount) {
        return;
    }

    var spring = springs[index];
    let dt = params.deltaTime;

    // Calculate spring force: F = -k * (x - target) - c * v
    let displacement = spring.position - spring.targetValue;
    let springForce = -spring.stiffness * displacement;
    let dampingForce = -spring.damping * spring.velocity;
    let totalForce = springForce + dampingForce;

    // Calculate acceleration: a = F / m
    let acceleration = totalForce / max(spring.mass, 0.001);

    // Semi-implicit Euler: update velocity first, then position
    spring.velocity = spring.velocity + acceleration * dt;

    // Clamp velocity to prevent instability
    spring.velocity = clamp(spring.velocity, -params.maxVelocity, params.maxVelocity);

    // Update position
    spring.position = spring.position + spring.velocity * dt;

    let isSettled = abs(displacement) < spring.restDelta && abs(spring.velocity) < spring.restSpeed;

    if (isSettled) {
        spring.position = spring.targetValue;
        spring.velocity = 0.0;
        settled[index] = 1u;
    } else {
        settled[index] = 0u;
    }

    // Write back state
    springs[index] = spring;
    outputs[index] = spring.position;
}

// Verlet integration variant (more stable for very stiff springs)
@compute @workgroup_size(64)
fn updateSpringsVerlet(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let springCount = arrayLength(&springs);

    if (index >= springCount) {
        return;
    }

    var spring = springs[index];
    let dt = params.deltaTime;
    let dt2 = dt * dt;

    // Calculate spring force
    let displacement = spring.position - spring.targetValue;
    let springForce = -spring.stiffness * displacement;
    let dampingForce = -spring.damping * spring.velocity;
    let totalForce = springForce + dampingForce;
    let acceleration = totalForce / max(spring.mass, 0.001);

    // Verlet integration
    let newPosition = spring.position + spring.velocity * dt + 0.5 * acceleration * dt2;

    // Calculate new velocity from position change
    let newVelocity = (newPosition - spring.position) / dt;

    spring.position = newPosition;
    spring.velocity = clamp(newVelocity, -params.maxVelocity, params.maxVelocity);

    // Check settlement
    let isSettled = abs(displacement) < spring.restDelta && abs(spring.velocity) < spring.restSpeed;

    if (isSettled) {
        spring.position = spring.targetValue;
        spring.velocity = 0.0;
        settled[index] = 1u;
    } else {
        settled[index] = 0u;
    }

    springs[index] = spring;
    outputs[index] = spring.position;
}
`;

// WGSL shader for Inertia physics
export const INERTIA_SHADER = `
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
        let decayFactor = exp(-dtMs / max(state.timeConstantMs, 0.001));
        state.velocity = state.velocity * decayFactor;
        state.position = state.position + state.velocity * dt;

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
                state.velocity = 0.0;
                state.bounceVelocity = 0.0;
                state.inBounce = 0.0;
                isStopped = true;
            } else {
                state.inBounce = 1.0;
                state.bounceVelocity = state.velocity;
                state.velocity = 0.0;
            }
        }
    } else {
        let displacement = state.position - state.boundTarget;
        let force = -state.bounceStiffness * displacement - state.bounceDamping * state.bounceVelocity;
        let acceleration = force / max(state.bounceMass, 0.001);

        state.bounceVelocity = state.bounceVelocity + acceleration * dt;
        state.position = state.position + state.bounceVelocity * dt;

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
`;

// Combined physics shader with both spring and inertia
export const PHYSICS_COMBINED_SHADER = `
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
`;

/**
 * Spring state data for CPU packing
 */
export interface SpringStateData {
  position: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
  mass: number;
  restLength?: number;
}

/**
 * Inertia state data for CPU packing
 */
export interface InertiaStateData {
  position: number;
  velocity: number;
  friction: number;
  bounciness?: number;
  minBound?: number;
  maxBound?: number;
}

/**
 * Simulation parameters
 */
export interface PhysicsSimParams {
  deltaTime: number;
  maxVelocity?: number;
  settleThreshold?: number;
}

// Data layout constants
export const SPRING_STATE_STRIDE = 8;
export const INERTIA_STATE_STRIDE = 8;
export const PHYSICS_STATE_STRIDE = 16;
export const SIM_PARAMS_SIZE = 16; // 4 floats

/**
 * Pack spring states for GPU upload
 */
export function packSpringStates(springs: SpringStateData[]): Float32Array {
  const data = new Float32Array(springs.length * SPRING_STATE_STRIDE);
  for (let i = 0; i < springs.length; i++) {
    const s = springs[i];
    const offset = i * SPRING_STATE_STRIDE;
    data[offset + 0] = s.position;
    data[offset + 1] = s.velocity;
    data[offset + 2] = s.target;
    data[offset + 3] = s.stiffness;
    data[offset + 4] = s.damping;
    data[offset + 5] = s.mass;
    data[offset + 6] = s.restLength ?? 0;
    data[offset + 7] = 0; // padding
  }
  return data;
}

/**
 * Pack inertia states for GPU upload
 */
export function packInertiaStates(inertias: InertiaStateData[]): Float32Array {
  const data = new Float32Array(inertias.length * INERTIA_STATE_STRIDE);
  for (let i = 0; i < inertias.length; i++) {
    const s = inertias[i];
    const offset = i * INERTIA_STATE_STRIDE;
    data[offset + 0] = s.position;
    data[offset + 1] = s.velocity;
    data[offset + 2] = s.friction;
    data[offset + 3] = s.bounciness ?? 0;
    data[offset + 4] = s.minBound ?? 0;
    data[offset + 5] = s.maxBound ?? 0;
    data[offset + 6] = 0; // padding
    data[offset + 7] = 0; // padding
  }
  return data;
}

/**
 * Pack simulation parameters for GPU upload
 */
export function packSimParams(params: PhysicsSimParams): Float32Array {
  return new Float32Array([
    params.deltaTime,
    params.maxVelocity ?? 10000,
    params.settleThreshold ?? 0.001,
    0, // padding
  ]);
}

/**
 * Unpack spring states from GPU
 */
export function unpackSpringStates(data: Float32Array): SpringStateData[] {
  const count = data.length / SPRING_STATE_STRIDE;
  const results: SpringStateData[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * SPRING_STATE_STRIDE;
    results.push({
      position: data[offset + 0],
      velocity: data[offset + 1],
      target: data[offset + 2],
      stiffness: data[offset + 3],
      damping: data[offset + 4],
      mass: data[offset + 5],
      restLength: data[offset + 6],
    });
  }
  return results;
}

/**
 * Calculate critical damping for a spring
 * Critical damping = 2 * sqrt(stiffness * mass)
 */
export function calculateCriticalDamping(stiffness: number, mass: number): number {
  return 2 * Math.sqrt(stiffness * mass);
}

/**
 * Create spring preset configurations
 */
export const SPRING_PRESETS = {
  // Gentle spring (slow, smooth)
  gentle: { stiffness: 100, damping: 20, mass: 1 },
  // Default spring (balanced)
  default: { stiffness: 170, damping: 26, mass: 1 },
  // Wobbly spring (bouncy)
  wobbly: { stiffness: 180, damping: 12, mass: 1 },
  // Stiff spring (fast, snappy)
  stiff: { stiffness: 210, damping: 20, mass: 1 },
  // Slow spring (very smooth)
  slow: { stiffness: 280, damping: 60, mass: 1 },
  // Molasses (very slow)
  molasses: { stiffness: 280, damping: 120, mass: 1 },
} as const;
