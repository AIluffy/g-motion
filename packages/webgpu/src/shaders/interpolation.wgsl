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

const BUILTIN_EASING_COUNT: u32 = 31u;

const EASING_MODE_IN: u32 = 0u;
const EASING_MODE_OUT: u32 = 1u;
const EASING_MODE_IN_OUT: u32 = 2u;

const EASING_KIND_LINEAR: u32 = 0u;
const EASING_KIND_POW: u32 = 1u;
const EASING_KIND_SINE: u32 = 2u;
const EASING_KIND_EXPO: u32 = 3u;
const EASING_KIND_CIRC: u32 = 4u;
const EASING_KIND_BACK: u32 = 5u;
const EASING_KIND_ELASTIC: u32 = 6u;
const EASING_KIND_BOUNCE: u32 = 7u;

const EASING_KIND: array<u32, BUILTIN_EASING_COUNT> = array<u32, BUILTIN_EASING_COUNT>(
    EASING_KIND_LINEAR,
    EASING_KIND_POW, EASING_KIND_POW, EASING_KIND_POW,
    EASING_KIND_POW, EASING_KIND_POW, EASING_KIND_POW,
    EASING_KIND_POW, EASING_KIND_POW, EASING_KIND_POW,
    EASING_KIND_POW, EASING_KIND_POW, EASING_KIND_POW,
    EASING_KIND_SINE, EASING_KIND_SINE, EASING_KIND_SINE,
    EASING_KIND_EXPO, EASING_KIND_EXPO, EASING_KIND_EXPO,
    EASING_KIND_CIRC, EASING_KIND_CIRC, EASING_KIND_CIRC,
    EASING_KIND_BACK, EASING_KIND_BACK, EASING_KIND_BACK,
    EASING_KIND_ELASTIC, EASING_KIND_ELASTIC, EASING_KIND_ELASTIC,
    EASING_KIND_BOUNCE, EASING_KIND_BOUNCE, EASING_KIND_BOUNCE,
);

const EASING_MODE: array<u32, BUILTIN_EASING_COUNT> = array<u32, BUILTIN_EASING_COUNT>(
    EASING_MODE_IN,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
    EASING_MODE_IN, EASING_MODE_OUT, EASING_MODE_IN_OUT,
);

const EASING_PARAM: array<u32, BUILTIN_EASING_COUNT> = array<u32, BUILTIN_EASING_COUNT>(
    0u,
    2u, 2u, 2u,
    3u, 3u, 3u,
    4u, 4u, 4u,
    5u, 5u, 5u,
    0u, 0u, 0u,
    0u, 0u, 0u,
    0u, 0u, 0u,
    0u, 0u, 0u,
    0u, 0u, 0u,
    0u, 0u, 0u,
);

fn powInt(t: f32, exponent: u32) -> f32 {
    switch (exponent) {
        case 2u: { return t * t; }
        case 3u: { return t * t * t; }
        case 4u: { let t2 = t * t; return t2 * t2; }
        case 5u: { let t2 = t * t; return t2 * t2 * t; }
        default: { return pow(t, f32(exponent)); }
    }
}

fn applyPow(t: f32, exponent: u32, mode: u32) -> f32 {
    if (mode == EASING_MODE_IN) {
        return powInt(t, exponent);
    }
    if (mode == EASING_MODE_OUT) {
        return 1.0 - powInt(1.0 - t, exponent);
    }
    if (t < 0.5) {
        return powInt(2.0 * t, exponent) / 2.0;
    }
    return 1.0 - powInt(-2.0 * t + 2.0, exponent) / 2.0;
}

fn applySine(t: f32, mode: u32) -> f32 {
    if (mode == EASING_MODE_IN) {
        return 1.0 - cos((t * 3.14159265) / 2.0);
    }
    if (mode == EASING_MODE_OUT) {
        return sin((t * 3.14159265) / 2.0);
    }
    return -(cos(3.14159265 * t) - 1.0) / 2.0;
}

fn applyExpo(t: f32, mode: u32) -> f32 {
    if (mode == EASING_MODE_IN) {
        if (t == 0.0) {
            return 0.0;
        }
        return pow(2.0, 10.0 * t - 10.0);
    }
    if (mode == EASING_MODE_OUT) {
        if (t == 1.0) {
            return 1.0;
        }
        return 1.0 - pow(2.0, -10.0 * t);
    }
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    if (t < 0.5) {
        return pow(2.0, 20.0 * t - 10.0) / 2.0;
    }
    return (2.0 - pow(2.0, -20.0 * t + 10.0)) / 2.0;
}

fn applyCirc(t: f32, mode: u32) -> f32 {
    if (mode == EASING_MODE_IN) {
        return 1.0 - sqrt(1.0 - t * t);
    }
    if (mode == EASING_MODE_OUT) {
        let u = t - 1.0;
        return sqrt(1.0 - u * u);
    }
    if (t < 0.5) {
        let u = 2.0 * t;
        return (1.0 - sqrt(1.0 - u * u)) / 2.0;
    }
    let u = -2.0 * t + 2.0;
    return (sqrt(1.0 - u * u) + 1.0) / 2.0;
}

fn applyBack(t: f32, mode: u32) -> f32 {
    let c1 = 1.70158;
    if (mode == EASING_MODE_IN) {
        let c3 = c1 + 1.0;
        return c3 * t * t * t - c1 * t * t;
    }
    if (mode == EASING_MODE_OUT) {
        let c3 = c1 + 1.0;
        let u = t - 1.0;
        return 1.0 + c3 * u * u * u + c1 * u * u;
    }
    let c2 = c1 * 1.525;
    if (t < 0.5) {
        let u = 2.0 * t;
        return (u * u * ((c2 + 1.0) * u - c2)) / 2.0;
    }
    let u = 2.0 * t - 2.0;
    return (u * u * ((c2 + 1.0) * u + c2) + 2.0) / 2.0;
}

fn applyElastic(t: f32, mode: u32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    if (mode == EASING_MODE_IN) {
        let c4 = (2.0 * 3.14159265) / 3.0;
        return -pow(2.0, 10.0 * t - 10.0) * sin((t * 10.0 - 10.75) * c4);
    }
    if (mode == EASING_MODE_OUT) {
        let c4 = (2.0 * 3.14159265) / 3.0;
        return pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * c4) + 1.0;
    }
    let c5 = (2.0 * 3.14159265) / 4.5;
    if (t < 0.5) {
        return -(pow(2.0, 20.0 * t - 10.0) * sin((20.0 * t - 11.125) * c5)) / 2.0;
    }
    return (pow(2.0, -20.0 * t + 10.0) * sin((20.0 * t - 11.125) * c5)) / 2.0 + 1.0;
}

fn easeOutBounceCore(t: f32) -> f32 {
    let n1 = 7.5625;
    let d1 = 2.75;
    if (t < 1.0 / d1) {
        return n1 * t * t;
    }
    if (t < 2.0 / d1) {
        let u = t - 1.5 / d1;
        return n1 * u * u + 0.75;
    }
    if (t < 2.5 / d1) {
        let u = t - 2.25 / d1;
        return n1 * u * u + 0.9375;
    }
    let u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
}

fn applyBounce(t: f32, mode: u32) -> f32 {
    if (mode == EASING_MODE_OUT) {
        return easeOutBounceCore(t);
    }
    if (mode == EASING_MODE_IN) {
        return 1.0 - easeOutBounceCore(1.0 - t);
    }
    if (t < 0.5) {
        return (1.0 - easeOutBounceCore(1.0 - 2.0 * t)) / 2.0;
    }
    return (1.0 + easeOutBounceCore(2.0 * t - 1.0)) / 2.0;
}

fn applyBuiltinEasing(t: f32, easingId: u32) -> f32 {
    let id = min(easingId, BUILTIN_EASING_COUNT - 1u);
    let kind = EASING_KIND[id];
    let mode = EASING_MODE[id];
    let param = EASING_PARAM[id];
    switch (kind) {
        case EASING_KIND_LINEAR: { return t; }
        case EASING_KIND_POW: { return applyPow(t, param, mode); }
        case EASING_KIND_SINE: { return applySine(t, mode); }
        case EASING_KIND_EXPO: { return applyExpo(t, mode); }
        case EASING_KIND_CIRC: { return applyCirc(t, mode); }
        case EASING_KIND_BACK: { return applyBack(t, mode); }
        case EASING_KIND_ELASTIC: { return applyElastic(t, mode); }
        case EASING_KIND_BOUNCE: { return applyBounce(t, mode); }
        default: { return t; }
    }
}

// CUSTOM_EASING_FUNCTIONS
fn applyEasing(t: f32, easingId: f32) -> f32 {
    let id = u32(easingId);
    if (id < BUILTIN_EASING_COUNT) {
        return applyBuiltinEasing(t, id);
    }
    switch (id) {
        // CUSTOM_EASING_SWITCH_CASES
        default: { return t; }
    }
}

struct ActiveKeyframeSearchResult {
    index: u32,
    isActive: u32,
    progress: f32,
}

fn binarySearchKeyframeInChannel(
    time: f32,
    baseIndex: u32,
    count: u32,
) -> ActiveKeyframeSearchResult {
    var result: ActiveKeyframeSearchResult;
    result.index = baseIndex;
    result.isActive = 0u;
    result.progress = 0.0;

    if (count == 0u) {
        return result;
    }

    var left = 0u;
    var right = count;

    while (left < right) {
        let mid = (left + right) / 2u;
        let kf = keyframes[baseIndex + mid];
        let start = kf.startTime;
        let endTime = kf.startTime + kf.duration;

        if (time < start) {
            right = mid;
        } else if (time > endTime) {
            left = mid + 1u;
        } else {
            result.index = baseIndex + mid;
            result.isActive = 1u;
            let duration = endTime - start;
            if (duration > 0.0) {
                result.progress = (time - start) / duration;
            }
            return result;
        }
    }

    if (left > 0u && left < count) {
        result.index = baseIndex + left - 1u;
        result.progress = 1.0;
    } else if (left == 0u && count > 0u) {
        result.index = baseIndex;
        result.progress = 0.0;
    }

    return result;
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

    let adjustedElapsedTime = state.currentTime;

    for (var c: u32 = 0u; c < channelCount; c = c + 1u) {
        let baseIndex = index * channelCount * MAX_KEYFRAMES_PER_CHANNEL + c * MAX_KEYFRAMES_PER_CHANNEL;

        var validCount: u32 = 0u;
        for (var i: u32 = 0u; i < MAX_KEYFRAMES_PER_CHANNEL; i = i + 1u) {
            let kf = keyframes[baseIndex + i];
            if (kf.duration <= 0.0) {
                break;
            }
            validCount = validCount + 1u;
        }

        if (validCount == 0u) {
            let outIndex = index * channelCount + c;
            outputs[outIndex] = 0.0;
            continue;
        }

        let searchResult = binarySearchKeyframeInChannel(adjustedElapsedTime, baseIndex, validCount);
        let activeIndex = searchResult.index;
        let activeKf = keyframes[activeIndex];

        if (activeKf.duration <= 0.0) {
            let outIndex = index * channelCount + c;
            outputs[outIndex] = 0.0;
            continue;
        }

        var progress = searchResult.progress;
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
