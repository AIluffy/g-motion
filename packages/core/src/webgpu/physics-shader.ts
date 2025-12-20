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
    target: f32,        // Target position
    stiffness: f32,     // Spring stiffness (k)
    damping: f32,       // Damping coefficient (c)
    mass: f32,          // Mass (m)
    restLength: f32,    // Rest length (for offset springs)
    _pad: f32,
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
    let displacement = spring.position - spring.target - spring.restLength;
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

    // Check if spring has settled
    let isSettled = abs(displacement) < params.settleThreshold &&
                    abs(spring.velocity) < params.settleThreshold;

    if (isSettled) {
        spring.position = spring.target + spring.restLength;
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
    let displacement = spring.position - spring.target - spring.restLength;
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
    let isSettled = abs(displacement) < params.settleThreshold &&
                    abs(spring.velocity) < params.settleThreshold;

    if (isSettled) {
        spring.position = spring.target + spring.restLength;
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
    position: f32,      // Current position
    velocity: f32,      // Current velocity
    friction: f32,      // Friction coefficient (0-1, higher = more friction)
    bounciness: f32,    // Bounce factor for boundaries (0-1)
    minBound: f32,      // Minimum boundary
    maxBound: f32,      // Maximum boundary
    _pad1: f32,
    _pad2: f32,
}

struct SimParams {
    deltaTime: f32,
    stopThreshold: f32, // Velocity threshold to stop
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var<storage, read_write> inertias: array<InertiaState>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var<storage, read_write> outputs: array<f32>;
@group(0) @binding(3) var<storage, read_write> stopped: array<u32>;

// Update inertia with friction and optional boundaries
@compute @workgroup_size(64)
fn updateInertia(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let count = arrayLength(&inertias);

    if (index >= count) {
        return;
    }

    var state = inertias[index];
    let dt = params.deltaTime;

    // Apply friction (exponential decay)
    let frictionFactor = pow(1.0 - state.friction, dt * 60.0);
    state.velocity = state.velocity * frictionFactor;

    // Update position
    state.position = state.position + state.velocity * dt;

    // Handle boundaries with bounce
    if (state.minBound < state.maxBound) {
        if (state.position < state.minBound) {
            state.position = state.minBound + (state.minBound - state.position) * state.bounciness;
            state.velocity = -state.velocity * state.bounciness;
        } else if (state.position > state.maxBound) {
            state.position = state.maxBound - (state.position - state.maxBound) * state.bounciness;
            state.velocity = -state.velocity * state.bounciness;
        }
    }

    // Check if stopped
    let isStopped = abs(state.velocity) < params.stopThreshold;
    if (isStopped) {
        state.velocity = 0.0;
        stopped[index] = 1u;
    } else {
        stopped[index] = 0u;
    }

    inertias[index] = state;
    outputs[index] = state.position;
}
`;

// Combined physics shader with both spring and inertia
export const PHYSICS_COMBINED_SHADER = `
// Physics type enum
const PHYSICS_SPRING: u32 = 0u;
const PHYSICS_INERTIA: u32 = 1u;

// Unified physics state
struct PhysicsState {
    position: f32,
    velocity: f32,
    target: f32,        // Spring target or unused for inertia
    param1: f32,        // Spring: stiffness, Inertia: friction
    param2: f32,        // Spring: damping, Inertia: bounciness
    param3: f32,        // Spring: mass, Inertia: minBound
    param4: f32,        // Spring: restLength, Inertia: maxBound
    physicsType: u32,   // 0: spring, 1: inertia
}

struct SimParams {
    deltaTime: f32,
    maxVelocity: f32,
    settleThreshold: f32,
    _pad: f32,
}

@group(0) @binding(0) var<storage, read_write> states: array<PhysicsState>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var<storage, read_write> outputs: array<f32>;
@group(0) @binding(3) var<storage, read_write> finished: array<u32>;

fn updateSpringState(state: ptr<function, PhysicsState>, dt: f32, maxVel: f32, threshold: f32) -> bool {
    let displacement = (*state).position - (*state).target - (*state).param4;
    let springForce = -(*state).param1 * displacement;
    let dampingForce = -(*state).param2 * (*state).velocity;
    let acceleration = (springForce + dampingForce) / max((*state).param3, 0.001);

    (*state).velocity = clamp((*state).velocity + acceleration * dt, -maxVel, maxVel);
    (*state).position = (*state).position + (*state).velocity * dt;

    return abs(displacement) < threshold && abs((*state).velocity) < threshold;
}

fn updateInertiaState(state: ptr<function, PhysicsState>, dt: f32, threshold: f32) -> bool {
    let frictionFactor = pow(1.0 - (*state).param1, dt * 60.0);
    (*state).velocity = (*state).velocity * frictionFactor;
    (*state).position = (*state).position + (*state).velocity * dt;

    // Boundary handling
    let minB = (*state).param3;
    let maxB = (*state).param4;
    if (minB < maxB) {
        if ((*state).position < minB) {
            (*state).position = minB + (minB - (*state).position) * (*state).param2;
            (*state).velocity = -(*state).velocity * (*state).param2;
        } else if ((*state).position > maxB) {
            (*state).position = maxB - ((*state).position - maxB) * (*state).param2;
            (*state).velocity = -(*state).velocity * (*state).param2;
        }
    }

    return abs((*state).velocity) < threshold;
}

@compute @workgroup_size(64)
fn updatePhysics(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= arrayLength(&states)) {
        return;
    }

    var state = states[index];
    var isFinished = false;

    if (state.physicsType == PHYSICS_SPRING) {
        isFinished = updateSpringState(&state, params.deltaTime, params.maxVelocity, params.settleThreshold);
        if (isFinished) {
            state.position = state.target + state.param4;
            state.velocity = 0.0;
        }
    } else {
        isFinished = updateInertiaState(&state, params.deltaTime, params.settleThreshold);
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
export const PHYSICS_STATE_STRIDE = 8;
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
