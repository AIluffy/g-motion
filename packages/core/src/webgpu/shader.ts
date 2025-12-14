import { CustomGpuEasing } from './custom-easing';

// T031: Built-in WGSL Shader for Interpolation

const BASE_INTERPOLATION_SHADER = `
// Keyframe structure for animation data
struct Keyframe {
    startTime: f32,
    duration: f32,
    startValue: f32,
    endValue: f32,
    easingId: f32,
}

// Entity animation state
struct EntityState {
    startTime: f32,
    currentTime: f32,
    playbackRate: f32,
    status: f32, // 0: Idle, 1: Running, 2: Paused, 3: Finished
}

// Storage bindings
@group(0) @binding(0) var<storage, read_write> states: array<EntityState>;
@group(0) @binding(1) var<storage, read> keyframes: array<Keyframe>;
@group(0) @binding(2) var<storage, read_write> outputs: array<f32>;

// Easing functions - ID 0-30
fn easeLinear(t: f32) -> f32 {
    return t;
}

fn easeInQuad(t: f32) -> f32 {
    return t * t;
}

fn easeOutQuad(t: f32) -> f32 {
    return 1.0 - (1.0 - t) * (1.0 - t);
}

fn easeInOutQuad(t: f32) -> f32 {
    if (t < 0.5) {
        return 2.0 * t * t;
    } else {
        return 1.0 - pow(-2.0 * t + 2.0, 2.0) / 2.0;
    }
}

fn easeInCubic(t: f32) -> f32 {
    return t * t * t;
}

fn easeOutCubic(t: f32) -> f32 {
    return 1.0 - pow(1.0 - t, 3.0);
}

fn easeInOutCubic(t: f32) -> f32 {
    if (t < 0.5) {
        return 4.0 * t * t * t;
    } else {
        return 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
    }
}

fn easeInQuart(t: f32) -> f32 {
    return t * t * t * t;
}

fn easeOutQuart(t: f32) -> f32 {
    return 1.0 - pow(1.0 - t, 4.0);
}

fn easeInOutQuart(t: f32) -> f32 {
    if (t < 0.5) {
        return 8.0 * t * t * t * t;
    } else {
        return 1.0 - pow(-2.0 * t + 2.0, 4.0) / 2.0;
    }
}

fn easeInQuint(t: f32) -> f32 {
    return t * t * t * t * t;
}

fn easeOutQuint(t: f32) -> f32 {
    return 1.0 - pow(1.0 - t, 5.0);
}

fn easeInOutQuint(t: f32) -> f32 {
    if (t < 0.5) {
        return 16.0 * t * t * t * t * t;
    } else {
        return 1.0 - pow(-2.0 * t + 2.0, 5.0) / 2.0;
    }
}

fn easeInSine(t: f32) -> f32 {
    return 1.0 - cos((t * 3.14159265) / 2.0);
}

fn easeOutSine(t: f32) -> f32 {
    return sin((t * 3.14159265) / 2.0);
}

fn easeInOutSine(t: f32) -> f32 {
    return -(cos(3.14159265 * t) - 1.0) / 2.0;
}

fn easeInExpo(t: f32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    return pow(2.0, 10.0 * t - 10.0);
}

fn easeOutExpo(t: f32) -> f32 {
    if (t == 1.0) {
        return 1.0;
    }
    return 1.0 - pow(2.0, -10.0 * t);
}

fn easeInOutExpo(t: f32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    if (t < 0.5) {
        return pow(2.0, 20.0 * t - 10.0) / 2.0;
    } else {
        return (2.0 - pow(2.0, -20.0 * t + 10.0)) / 2.0;
    }
}

fn easeInCirc(t: f32) -> f32 {
    return 1.0 - sqrt(1.0 - pow(t, 2.0));
}

fn easeOutCirc(t: f32) -> f32 {
    return sqrt(1.0 - pow(t - 1.0, 2.0));
}

fn easeInOutCirc(t: f32) -> f32 {
    if (t < 0.5) {
        return (1.0 - sqrt(1.0 - pow(2.0 * t, 2.0))) / 2.0;
    } else {
        return (sqrt(1.0 - pow(-2.0 * t + 2.0, 2.0)) + 1.0) / 2.0;
    }
}

fn easeInBack(t: f32) -> f32 {
    let c1 = 1.70158;
    let c3 = c1 + 1.0;
    return c3 * t * t * t - c1 * t * t;
}

fn easeOutBack(t: f32) -> f32 {
    let c1 = 1.70158;
    let c3 = c1 + 1.0;
    return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0);
}

fn easeInOutBack(t: f32) -> f32 {
    let c1 = 1.70158;
    let c2 = c1 * 1.525;
    if (t < 0.5) {
        return (pow(2.0 * t, 2.0) * ((c2 + 1.0) * 2.0 * t - c2)) / 2.0;
    } else {
        return (pow(2.0 * t - 2.0, 2.0) * ((c2 + 1.0) * (t * 2.0 - 2.0) + c2) + 2.0) / 2.0;
    }
}

fn easeInElastic(t: f32) -> f32 {
    let c4 = (2.0 * 3.14159265) / 3.0;
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    return -pow(2.0, 10.0 * t - 10.0) * sin((t * 10.0 - 10.75) * c4);
}

fn easeOutElastic(t: f32) -> f32 {
    let c4 = (2.0 * 3.14159265) / 3.0;
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    return pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * c4) + 1.0;
}

fn easeInOutElastic(t: f32) -> f32 {
    let c5 = (2.0 * 3.14159265) / 4.5;
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    if (t < 0.5) {
        return -(pow(2.0, 20.0 * t - 10.0) * sin((20.0 * t - 11.125) * c5)) / 2.0;
    } else {
        return (pow(2.0, -20.0 * t + 10.0) * sin((20.0 * t - 11.125) * c5)) / 2.0 + 1.0;
    }
}

fn easeOutBounce(t: f32) -> f32 {
    let n1 = 7.5625;
    let d1 = 2.75;

    var out = t;
    if (t < 1.0 / d1) {
        out = n1 * t * t;
    } else if (t < 2.0 / d1) {
        out = n1 * (t - 1.5 / d1) * (t - 1.5 / d1) + 0.75;
    } else if (t < 2.5 / d1) {
        out = n1 * (t - 2.25 / d1) * (t - 2.25 / d1) + 0.9375;
    } else {
        out = n1 * (t - 2.625 / d1) * (t - 2.625 / d1) + 0.984375;
    }
    return out;
}

fn easeInBounce(t: f32) -> f32 {
    return 1.0 - easeOutBounce(1.0 - t);
}

fn easeInOutBounce(t: f32) -> f32 {
    if (t < 0.5) {
        return (1.0 - easeOutBounce(1.0 - 2.0 * t)) / 2.0;
    } else {
        return (1.0 + easeOutBounce(2.0 * t - 1.0)) / 2.0;
    }
}

// CUSTOM_EASING_FUNCTIONS

// Apply easing based on easing ID (0-30)
fn applyEasing(t: f32, easingId: f32) -> f32 {
    let id = u32(easingId);
    switch (id) {
        case 0u: { return easeLinear(t); }
        case 1u: { return easeInQuad(t); }
        case 2u: { return easeOutQuad(t); }
        case 3u: { return easeInOutQuad(t); }
        case 4u: { return easeInCubic(t); }
        case 5u: { return easeOutCubic(t); }
        case 6u: { return easeInOutCubic(t); }
        case 7u: { return easeInQuart(t); }
        case 8u: { return easeOutQuart(t); }
        case 9u: { return easeInOutQuart(t); }
        case 10u: { return easeInQuint(t); }
        case 11u: { return easeOutQuint(t); }
        case 12u: { return easeInOutQuint(t); }
        case 13u: { return easeInSine(t); }
        case 14u: { return easeOutSine(t); }
        case 15u: { return easeInOutSine(t); }
        case 16u: { return easeInExpo(t); }
        case 17u: { return easeOutExpo(t); }
        case 18u: { return easeInOutExpo(t); }
        case 19u: { return easeInCirc(t); }
        case 20u: { return easeOutCirc(t); }
        case 21u: { return easeInOutCirc(t); }
        case 22u: { return easeInBack(t); }
        case 23u: { return easeOutBack(t); }
        case 24u: { return easeInOutBack(t); }
        case 25u: { return easeInElastic(t); }
        case 26u: { return easeOutElastic(t); }
        case 27u: { return easeInOutElastic(t); }
        case 28u: { return easeInBounce(t); }
        case 29u: { return easeOutBounce(t); }
        case 30u: { return easeInOutBounce(t); }
        // CUSTOM_EASING_SWITCH_CASES
        default: { return t; }
    }
}

// Main compute kernel
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= arrayLength(&states)) {
        return;
    }

    var state = states[index];

    // Skip non-running entities
    if (state.status != 1.0) {
        outputs[index] = 0.0;
        return;
    }

    // Get keyframe data (assumes 1 keyframe per entity for MVP)
    let kf = keyframes[index];

    // Calculate progress within the keyframe
    let elapsedTime = state.currentTime - state.startTime;
    let adjustedElapsedTime = elapsedTime * state.playbackRate;
    var progress = adjustedElapsedTime / kf.duration;
    progress = clamp(progress, 0.0, 1.0);

    // Apply easing function
    let easedProgress = applyEasing(progress, kf.easingId);

    // Linear interpolation
    let interpolatedValue = kf.startValue + (kf.endValue - kf.startValue) * easedProgress;

    // Write result
    outputs[index] = interpolatedValue;
}
`;

function injectCustomEasings(shader: string, customEasings: CustomGpuEasing[]): string {
  if (!customEasings.length) return shader;

  const fnBlob = customEasings
    .map((e) => e.wgslFn.trim())
    .filter(Boolean)
    .join('\n\n');

  const caseBlob = customEasings
    .map((e) => `        case ${e.id}u: { return ${e.name}(t); }`)
    .join('\n');

  return shader
    .replace('// CUSTOM_EASING_FUNCTIONS', fnBlob ? `${fnBlob}\n` : '')
    .replace('// CUSTOM_EASING_SWITCH_CASES', caseBlob);
}

export function buildInterpolationShader(customEasings: CustomGpuEasing[]): string {
  return injectCustomEasings(BASE_INTERPOLATION_SHADER, customEasings);
}

export const INTERPOLATION_SHADER = BASE_INTERPOLATION_SHADER;
