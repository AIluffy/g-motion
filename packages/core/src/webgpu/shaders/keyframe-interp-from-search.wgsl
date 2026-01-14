const EASING_MODE_STANDARD: u32 = 0u;
const EASING_MODE_BEZIER: u32 = 1u;
const EASING_MODE_HOLD: u32 = 2u;

struct PackedKeyframe {
    w0: u32,
    w1: u32,
    w2: u32,
    w3: u32,
    flags: u32,
}

struct SearchResult {
    keyframeIndex: u32,
    isActive: u32,
    progress: f32,
    _pad: f32,
}

struct Params {
    useOptimizedSearch: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(0) var<storage, read> keyframes: array<PackedKeyframe>;
@group(0) @binding(1) var<storage, read> keyframeStartTimes: array<f32>;
@group(0) @binding(2) var<storage, read> keyframeDurations: array<f32>;
@group(0) @binding(3) var<storage, read> searchTimes: array<f32>;
@group(0) @binding(4) var<storage, read> keyframeOffsets: array<u32>;
@group(0) @binding(5) var<storage, read> keyframeCounts: array<u32>;
@group(0) @binding(6) var<storage, read> outputIndices: array<u32>;
@group(0) @binding(7) var<storage, read_write> outputs: array<f32>;
@group(0) @binding(8) var<uniform> params: Params;

var<workgroup> cachedOffsets: array<u32, 64>;
var<workgroup> cachedCounts: array<u32, 64>;

const ADAPTIVE_SEARCH_THRESHOLD: u32 = 20u;
const PREFETCH_LIMIT_SMALL: u32 = 32u;

fn halfToFloatBits(half: u32) -> f32 {
    let sign = (half & 0x8000u) >> 15u;
    let exponent = (half & 0x7c00u) >> 10u;
    let mantissa = half & 0x03ffu;
    if (exponent == 0u) {
        if (mantissa == 0u) {
            if (sign == 1u) {
                return -0.0;
            }
            return 0.0;
        }
        let v = f32(mantissa) / 1024.0;
        let s = select(1.0, -1.0, sign == 1u);
        return s * pow(2.0, -14.0) * v;
    }
    if (exponent == 31u) {
        if (mantissa == 0u) {
            if (sign == 1u) {
                return -1.0 / 0.0;
            }
            return 1.0 / 0.0;
        }
        return 0.0 / 0.0;
    }
    let s = select(1.0, -1.0, sign == 1u);
    let e = f32(i32(exponent) - 15);
    let m = 1.0 + f32(mantissa) / 1024.0;
    return s * pow(2.0, e) * m;
}

fn unpackHalfs(p: u32) -> vec2<f32> {
    let lo = p & 0xffffu;
    let hi = (p >> 16u) & 0xffffu;
    return vec2<f32>(halfToFloatBits(lo), halfToFloatBits(hi));
}

fn getStartAndEndTime(keyframeIndex: u32) -> vec2<f32> {
    let start = keyframeStartTimes[keyframeIndex];
    let duration = keyframeDurations[keyframeIndex];
    return vec2<f32>(start, start + duration);
}

fn getPackedTimes(keyframeIndex: u32) -> vec2<f32> {
    let start = keyframeStartTimes[keyframeIndex];
    let duration = keyframeDurations[keyframeIndex];
    return vec2<f32>(start, duration);
}

fn getPackedValues(kf: PackedKeyframe) -> vec2<f32> {
    return unpackHalfs(kf.w1);
}

fn getPackedBezier1(kf: PackedKeyframe) -> vec2<f32> {
    return unpackHalfs(kf.w2);
}

fn getPackedBezier2(kf: PackedKeyframe) -> vec2<f32> {
    return unpackHalfs(kf.w3);
}

fn getEasingIdAndMode(kf: PackedKeyframe) -> vec2<u32> {
    let id = kf.flags & 0xffffu;
    let mode = (kf.flags >> 16u) & 0x3u;
    return vec2<u32>(id, mode);
}

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

fn solveBezierT(x: f32, cx1: f32, cx2: f32) -> f32 {
    var t = x;
    for (var i = 0; i < 4; i = i + 1) {
        let t2 = t * t;
        let t3 = t2 * t;
        let mt = 1.0 - t;
        let mt2 = mt * mt;
        let bx = 3.0 * mt2 * t * cx1 + 3.0 * mt * t2 * cx2 + t3;
        let dbx = 3.0 * mt2 * cx1 + 6.0 * mt * t * (cx2 - cx1) + 3.0 * t2 * (1.0 - cx2);
        if (abs(dbx) < 0.000001) {
            break;
        }
        t = t - (bx - x) / dbx;
        t = clamp(t, 0.0, 1.0);
    }
    return t;
}

fn evaluatePackedBezier(progress: f32, kf: PackedKeyframe) -> f32 {
    let b1 = getPackedBezier1(kf);
    let b2 = getPackedBezier2(kf);
    return evaluateCubicBezier(progress, b1.x, b1.y, b2.x, b2.y);
}

fn evaluateBezierY(t: f32, cy1: f32, cy2: f32) -> f32 {
    let mt = 1.0 - t;
    let mt2 = mt * mt;
    let t2 = t * t;
    return 3.0 * mt2 * t * cy1 + 3.0 * mt * t2 * cy2 + t * t2;
}

fn evaluateCubicBezier(x: f32, cx1: f32, cy1: f32, cx2: f32, cy2: f32) -> f32 {
    if (x <= 0.0) { return 0.0; }
    if (x >= 1.0) { return 1.0; }
    let t = solveBezierT(x, cx1, cx2);
    return evaluateBezierY(t, cy1, cy2);
}

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
        default: { return t; }
    }
}

fn linearSearchKeyframe(time: f32, startOffset: u32, count: u32) -> SearchResult {
    var result: SearchResult;
    result.keyframeIndex = 0u;
    result.isActive = 0u;
    result.progress = 0.0;
    result._pad = 0.0;

    if (count == 0u) {
        return result;
    }

    var lastIndex = 0u;
    for (var i = 0u; i < count; i = i + 1u) {
        let times = getStartAndEndTime(startOffset + i);
        let start = times.x;
        let endTime = times.y;

        if (time >= start && time <= endTime) {
            result.keyframeIndex = startOffset + i;
            result.isActive = 1u;
            let duration = endTime - start;
            if (duration > 0.0) {
                result.progress = (time - start) / duration;
            }
            return result;
        }

        if (time > endTime) {
            lastIndex = i;
        }
    }

    let firstTimes = getStartAndEndTime(startOffset);
    if (time < firstTimes.x) {
        result.keyframeIndex = startOffset;
        result.progress = 0.0;
        return result;
    }

    let clampedIndex = min(lastIndex, count - 1u);
    result.keyframeIndex = startOffset + clampedIndex;
    result.progress = 1.0;
    return result;
}

fn binarySearchKeyframe(time: f32, startOffset: u32, count: u32) -> SearchResult {
    var result: SearchResult;
    result.keyframeIndex = 0u;
    result.isActive = 0u;
    result.progress = 0.0;
    result._pad = 0.0;

    if (count == 0u) {
        return result;
    }

    var left = 0u;
    var right = count;

    while (left < right) {
        let mid = (left + right) / 2u;
        let times = getStartAndEndTime(startOffset + mid);
        let start = times.x;
        let endTime = times.y;

        if (time < start) {
            right = mid;
        } else if (time > endTime) {
            left = mid + 1u;
        } else {
            result.keyframeIndex = startOffset + mid;
            result.isActive = 1u;
            let duration = endTime - start;
            if (duration > 0.0) {
                result.progress = (time - start) / duration;
            }
            return result;
        }
    }

    if (left > 0u && left < count) {
        result.keyframeIndex = startOffset + left - 1u;
        result.progress = 1.0;
    } else if (left == 0u && count > 0u) {
        result.keyframeIndex = startOffset;
        result.progress = 0.0;
    }

    return result;
}

fn adaptiveSearchKeyframe(time: f32, startOffset: u32, count: u32) -> SearchResult {
    if (count < ADAPTIVE_SEARCH_THRESHOLD) {
        return linearSearchKeyframe(time, startOffset, count);
    }
    return binarySearchKeyframe(time, startOffset, count);
}

fn linearSearchKeyframeOptimized(time: f32, startOffset: u32, count: u32) -> SearchResult {
    var result: SearchResult;
    result.keyframeIndex = 0u;
    result.isActive = 0u;
    result.progress = 0.0;
    result._pad = 0.0;

    if (count == 0u) {
        return result;
    }

    var lastIndex = 0u;

    if (count <= PREFETCH_LIMIT_SMALL) {
        var starts: array<f32, PREFETCH_LIMIT_SMALL>;
        var ends: array<f32, PREFETCH_LIMIT_SMALL>;
        var i = 0u;
        while (i < count && i < PREFETCH_LIMIT_SMALL) {
            let times = getStartAndEndTime(startOffset + i);
            starts[i] = times.x;
            ends[i] = times.y;
            i = i + 1u;
        }

        var j = 0u;
        while (j < count && j < PREFETCH_LIMIT_SMALL) {
            let start = starts[j];
            let endTime = ends[j];

            if (time >= start && time <= endTime) {
                result.keyframeIndex = startOffset + j;
                result.isActive = 1u;
                let duration = endTime - start;
                if (duration > 0.0) {
                    result.progress = (time - start) / duration;
                }
                return result;
            }

            if (time > endTime) {
                lastIndex = j;
            }

            j = j + 1u;
        }

        if (time < starts[0u]) {
            result.keyframeIndex = startOffset;
            result.progress = 0.0;
            return result;
        }

        let clampedIndex = min(lastIndex, count - 1u);
        result.keyframeIndex = startOffset + clampedIndex;
        result.progress = 1.0;
        return result;
    }

    var k = 0u;
    while (k < count) {
        let times = getStartAndEndTime(startOffset + k);
        let start = times.x;
        let endTime = times.y;

        if (time >= start && time <= endTime) {
            result.keyframeIndex = startOffset + k;
            result.isActive = 1u;
            let duration = endTime - start;
            if (duration > 0.0) {
                result.progress = (time - start) / duration;
            }
            return result;
        }

        if (time > endTime) {
            lastIndex = k;
        }

        k = k + 1u;
    }

    if (time < getStartAndEndTime(startOffset).x) {
        result.keyframeIndex = startOffset;
        result.progress = 0.0;
        return result;
    }

    let clampedIndex = min(lastIndex, count - 1u);
    result.keyframeIndex = startOffset + clampedIndex;
    result.progress = 1.0;
    return result;
}

fn binarySearchKeyframeOptimized(time: f32, startOffset: u32, count: u32) -> SearchResult {
    var result: SearchResult;
    result.keyframeIndex = 0u;
    result.isActive = 0u;
    result.progress = 0.0;
    result._pad = 0.0;

    if (count == 0u) {
        return result;
    }

    var left = 0u;
    var right = count;

    while (left < right) {
        let mid = (left + right) / 2u;
        let times = getStartAndEndTime(startOffset + mid);
        let start = times.x;
        let endTime = times.y;

        if (time < start) {
            right = mid;
        } else if (time > endTime) {
            left = mid + 1u;
        } else {
            result.keyframeIndex = startOffset + mid;
            result.isActive = 1u;
            let duration = endTime - start;
            if (duration > 0.0) {
                result.progress = (time - start) / duration;
            }
            return result;
        }
    }

    if (left > 0u && left < count) {
        result.keyframeIndex = startOffset + left - 1u;
        result.progress = 1.0;
    } else if (left == 0u && count > 0u) {
        result.keyframeIndex = startOffset;
        result.progress = 0.0;
    }

    return result;
}

fn adaptiveSearchKeyframeOptimized(time: f32, startOffset: u32, count: u32) -> SearchResult {
    if (count < ADAPTIVE_SEARCH_THRESHOLD) {
        return linearSearchKeyframeOptimized(time, startOffset, count);
    }
    return binarySearchKeyframeOptimized(time, startOffset, count);
}

@compute @workgroup_size(64)
fn interpolateFromSearch(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
) {
    let index = global_id.x;
    let count = arrayLength(&searchTimes);
    if (index >= count) {
        return;
    }

    let localIndex = local_id.x;
    cachedOffsets[localIndex] = keyframeOffsets[index];
    cachedCounts[localIndex] = keyframeCounts[index];
    workgroupBarrier();

    let time = searchTimes[index];
    let offset = cachedOffsets[localIndex];
    let kfCount = cachedCounts[localIndex];

    let res = select(
        adaptiveSearchKeyframe(time, offset, kfCount),
        adaptiveSearchKeyframeOptimized(time, offset, kfCount),
        params.useOptimizedSearch == 1u,
    );
    let outIndex = outputIndices[index];

    if (res.isActive == 0u) {
        if (outIndex < arrayLength(&outputs)) {
            outputs[outIndex] = 0.0;
        }
        return;
    }

    let kf = keyframes[res.keyframeIndex];
    let times = getPackedTimes(res.keyframeIndex);
    let values = getPackedValues(kf);
    let easingInfo = getEasingIdAndMode(kf);
    let duration = times.y;

    if (duration <= 0.0) {
        if (outIndex < arrayLength(&outputs)) {
            outputs[outIndex] = values.y;
        }
        return;
    }

    var progress = clamp(res.progress, 0.0, 1.0);

    var easedProgress: f32;
    if (easingInfo.y == EASING_MODE_HOLD) {
        easedProgress = 1.0;
    } else if (easingInfo.y == EASING_MODE_BEZIER) {
        easedProgress = evaluatePackedBezier(progress, kf);
    } else {
        easedProgress = applyEasing(progress, f32(easingInfo.x));
    }

    let value = values.x + (values.y - values.x) * easedProgress;

    if (outIndex < arrayLength(&outputs)) {
        outputs[outIndex] = value;
    }
}
