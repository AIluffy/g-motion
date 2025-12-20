import { CustomGpuEasing } from './custom-easing';

// T031: Built-in WGSL Shader for Interpolation
// Extended with Bezier curve support (Phase 1.1)

const BASE_INTERPOLATION_SHADER = `
const MAX_KEYFRAMES_PER_CHANNEL: u32 = 4u;

// Easing mode constants
const EASING_MODE_STANDARD: f32 = 0.0;  // Use easingId for standard easing
const EASING_MODE_BEZIER: f32 = 1.0;    // Use bezier control points
const EASING_MODE_HOLD: f32 = 2.0;      // Hold at end value (step)

// Keyframe structure for animation data (extended with Bezier support)
struct Keyframe {
    startTime: f32,
    duration: f32,
    startValue: f32,
    endValue: f32,
    easingId: f32,
    // Bezier control points (cx1, cy1, cx2, cy2) - used when easingMode == BEZIER
    bezierCx1: f32,
    bezierCy1: f32,
    bezierCx2: f32,
    bezierCy2: f32,
    // Easing mode: 0=standard, 1=bezier, 2=hold
    easingMode: f32,
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

// ============================================================================
// Bezier Curve Evaluation (Phase 1.1)
// ============================================================================

// Newton-Raphson iteration to solve for t given x on cubic bezier
// This is needed because bezier curves are parametric - we need to find
// the parameter t that gives us the desired x coordinate
fn solveBezierT(x: f32, cx1: f32, cx2: f32) -> f32 {
    // For x-axis: B(t) = 3(1-t)²t·cx1 + 3(1-t)t²·cx2 + t³
    // We need to find t such that B(t) = x

    var t = x; // Initial guess

    // Newton-Raphson iterations (4 iterations is usually sufficient)
    for (var i = 0; i < 4; i = i + 1) {
        let t2 = t * t;
        let t3 = t2 * t;
        let mt = 1.0 - t;
        let mt2 = mt * mt;

        // B(t) for x-axis
        let bx = 3.0 * mt2 * t * cx1 + 3.0 * mt * t2 * cx2 + t3;

        // B'(t) derivative for x-axis
        let dbx = 3.0 * mt2 * cx1 + 6.0 * mt * t * (cx2 - cx1) + 3.0 * t2 * (1.0 - cx2);

        if (abs(dbx) < 0.000001) {
            break;
        }

        t = t - (bx - x) / dbx;
        t = clamp(t, 0.0, 1.0);
    }

    return t;
}

// Evaluate cubic bezier curve at parameter t for y-axis
fn evaluateBezierY(t: f32, cy1: f32, cy2: f32) -> f32 {
    let mt = 1.0 - t;
    let mt2 = mt * mt;
    let t2 = t * t;

    // B(t) = 3(1-t)²t·cy1 + 3(1-t)t²·cy2 + t³
    return 3.0 * mt2 * t * cy1 + 3.0 * mt * t2 * cy2 + t * t2;
}

// Main bezier easing function: given progress x in [0,1], return eased y in [0,1]
fn evaluateCubicBezier(x: f32, cx1: f32, cy1: f32, cx2: f32, cy2: f32) -> f32 {
    // Handle edge cases
    if (x <= 0.0) { return 0.0; }
    if (x >= 1.0) { return 1.0; }

    // Find parameter t for given x
    let t = solveBezierT(x, cx1, cx2);

    // Evaluate y at parameter t
    return evaluateBezierY(t, cy1, cy2);
}

// ============================================================================
// Standard Easing Functions (ID 0-30)
// ============================================================================

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
    let entityCount = arrayLength(&states);
    if (index >= entityCount) {
        return;
    }

    var state = states[index];

    let totalOutputs = arrayLength(&outputs);
    let channelCount = max(1u, totalOutputs / entityCount);

    if (state.status != 1.0) {
        for (var c: u32 = 0u; c < channelCount; c = c + 1u) {
            let outIndex = index * channelCount + c;
            outputs[outIndex] = 0.0;
        }
        return;
    }

    let elapsedTime = state.currentTime - state.startTime;
    let adjustedElapsedTime = elapsedTime * state.playbackRate;

    for (var c: u32 = 0u; c < channelCount; c = c + 1u) {
        let baseIndex = index * channelCount * MAX_KEYFRAMES_PER_CHANNEL + c * MAX_KEYFRAMES_PER_CHANNEL;

        var activeKf = keyframes[baseIndex];
        var found = false;

        for (var i: u32 = 0u; i < MAX_KEYFRAMES_PER_CHANNEL; i = i + 1u) {
            let idx = baseIndex + i;
            let kf = keyframes[idx];

            if (kf.duration <= 0.0) {
                break;
            }

            let start = kf.startTime;
            let endTime = kf.startTime + kf.duration;

            if (!found && adjustedElapsedTime < start) {
                activeKf = kf;
                found = true;
                break;
            }

            activeKf = kf;
            found = true;

            if (adjustedElapsedTime <= endTime) {
                break;
            }
        }

        if (activeKf.duration <= 0.0) {
            let outIndex = index * channelCount + c;
            outputs[outIndex] = 0.0;
            continue;
        }

        var progress = (adjustedElapsedTime - activeKf.startTime) / activeKf.duration;
        progress = clamp(progress, 0.0, 1.0);

        // Apply easing based on easing mode (Phase 1.1: Bezier support)
        var easedProgress: f32;
        if (activeKf.easingMode == EASING_MODE_HOLD) {
            // Hold mode: jump to end value
            easedProgress = 1.0;
        } else if (activeKf.easingMode == EASING_MODE_BEZIER) {
            // Bezier mode: use cubic bezier curve
            easedProgress = evaluateCubicBezier(
                progress,
                activeKf.bezierCx1,
                activeKf.bezierCy1,
                activeKf.bezierCx2,
                activeKf.bezierCy2
            );
        } else {
            // Standard mode: use easing function by ID
            easedProgress = applyEasing(progress, activeKf.easingId);
        }

        let interpolatedValue = activeKf.startValue + (activeKf.endValue - activeKf.startValue) * easedProgress;

        let outIndex = index * channelCount + c;
        outputs[outIndex] = interpolatedValue;
    }
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

// Easing mode constants for CPU-side usage
export const EASING_MODE = {
  STANDARD: 0,
  BEZIER: 1,
  HOLD: 2,
} as const;

// Keyframe data layout (10 floats per keyframe)
export const KEYFRAME_STRIDE = 10;

/**
 * Pack keyframe data for GPU upload
 * Layout: [startTime, duration, startValue, endValue, easingId, cx1, cy1, cx2, cy2, easingMode]
 */
export function packKeyframeForGPU(
  startTime: number,
  duration: number,
  startValue: number,
  endValue: number,
  easingId: number,
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number },
  easingMode: number = EASING_MODE.STANDARD,
): Float32Array {
  const data = new Float32Array(KEYFRAME_STRIDE);
  data[0] = startTime;
  data[1] = duration;
  data[2] = startValue;
  data[3] = endValue;
  data[4] = easingId;
  data[5] = bezier?.cx1 ?? 0;
  data[6] = bezier?.cy1 ?? 0;
  data[7] = bezier?.cx2 ?? 1;
  data[8] = bezier?.cy2 ?? 1;
  data[9] = easingMode;
  return data;
}
