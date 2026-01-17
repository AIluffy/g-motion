// Spring Physics GPU Shader
// GPU-accelerated spring physics simulations with semi-implicit Euler integration.
// Provides stable, accurate physics for spring-based animations.

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
    _pad0: f32,
    _pad1: f32,
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
