/**
 * Keyframe Preprocessing GPU Shader (Phase 3.1)
 *
 * GPU-accelerated keyframe data preparation and packing.
 * Handles channel mapping, easing ID resolution, and data layout optimization.
 */

// WGSL shader for keyframe preprocessing
export const KEYFRAME_PREPROCESS_SHADER = `
// Raw keyframe input (from CPU timeline data)
struct RawKeyframe {
    startTime: f32,
    endTime: f32,
    startValue: f32,
    endValue: f32,
    easingType: u32,    // Easing type enum
    easingParam1: f32,  // Custom easing parameter 1
    easingParam2: f32,  // Custom easing parameter 2
    _pad: f32,
}

// Packed keyframe output (GPU-optimized layout)
struct PackedKeyframe {
    w0: u32,
    w1: u32,
    w2: u32,
    w3: u32,
    flags: u32,
}

// Channel mapping descriptor
struct ChannelMap {
    propertyHash: u32,  // Hash of property name
    channelIndex: u32,  // Output channel index
    entityOffset: u32,  // Offset in entity's keyframe array
    keyframeCount: u32, // Number of keyframes for this channel
}

// Easing type to ID mapping
const EASING_LINEAR: u32 = 0u;
const EASING_EASE_IN_QUAD: u32 = 1u;
const EASING_EASE_OUT_QUAD: u32 = 2u;
const EASING_EASE_IN_OUT_QUAD: u32 = 3u;
const EASING_EASE_IN_CUBIC: u32 = 4u;
const EASING_EASE_OUT_CUBIC: u32 = 5u;
const EASING_EASE_IN_OUT_CUBIC: u32 = 6u;
const EASING_BEZIER: u32 = 100u;
const EASING_HOLD: u32 = 101u;

@group(0) @binding(0) var<storage, read> rawKeyframes: array<RawKeyframe>;
@group(0) @binding(1) var<storage, read> channelMaps: array<ChannelMap>;
@group(0) @binding(2) var<storage, read_write> packedKeyframes: array<PackedKeyframe>;
@group(0) @binding(3) var<storage, read_write> keyframeIndices: array<u32>; // Sorted indices

fn isNan(value: f32) -> bool {
    return value != value;
}

fn isFinite(value: f32) -> bool {
    return (value - value) == 0.0;
}

fn floatToHalfBits(value: f32) -> u32 {
    if (isNan(value)) {
        return 0x7e00u;
    }
    if (!isFinite(value)) {
        if (value > 0.0) {
            return 0x7c00u;
        }
        return 0xfc00u;
    }
    if (value == 0.0) {
        if (1.0 / value == -1.0 / 0.0) {
            return 0x8000u;
        }
        return 0u;
    }
    let fbits = bitcast<u32>(value);
    let sign = (fbits >> 16u) & 0x8000u;
    var exponent = i32((fbits >> 23u) & 0xffu) - 127 + 15;
    var mantissa = fbits & 0x7fffffu;
    if (exponent <= 0) {
        if (exponent < -10) {
            return sign;
        }
        mantissa = (mantissa | 0x800000u) >> u32(1 - exponent);
        exponent = 0;
    } else if (exponent >= 31) {
        return sign | 0x7c00u;
    } else {
        mantissa = mantissa >> 13u;
    }
    return sign | (u32(exponent) << 10u) | (mantissa & 0x3ffu);
}

fn packHalfs(a: f32, b: f32) -> u32 {
    let ha = floatToHalfBits(a) & 0xffffu;
    let hb = floatToHalfBits(b) & 0xffffu;
    return ha | (hb << 16u);
}

fn packEasingFlags(easingId: u32, easingMode: u32) -> u32 {
    let idBits = easingId & 0xffffu;
    let modeBits = (easingMode & 0x3u) << 16u;
    return idBits | modeBits;
}

// Convert easing type to shader easing ID
fn easingTypeToId(easingType: u32) -> u32 {
    switch (easingType) {
        case EASING_LINEAR: { return 0u; }
        case EASING_EASE_IN_QUAD: { return 1u; }
        case EASING_EASE_OUT_QUAD: { return 2u; }
        case EASING_EASE_IN_OUT_QUAD: { return 3u; }
        case EASING_EASE_IN_CUBIC: { return 4u; }
        case EASING_EASE_OUT_CUBIC: { return 5u; }
        case EASING_EASE_IN_OUT_CUBIC: { return 6u; }
        default: { return 0u; }
    }
}

// Get easing mode from type
fn getEasingMode(easingType: u32) -> u32 {
    if (easingType == EASING_BEZIER) {
        return 1u;
    } else if (easingType == EASING_HOLD) {
        return 2u;
    }
    return 0u;
}

// Pack keyframes for a single channel
@compute @workgroup_size(64)
fn packKeyframes(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let keyframeCount = arrayLength(&rawKeyframes);

    if (index >= keyframeCount) {
        return;
    }

    let raw = rawKeyframes[index];

    var packed: PackedKeyframe;
    let startTime = raw.startTime;
    let duration = raw.endTime - raw.startTime;
    let startValue = raw.startValue;
    let endValue = raw.endValue;
    var cx1 = 0.0;
    var cy1 = 0.0;
    var cx2 = 1.0;
    var cy2 = 1.0;
    if (raw.easingType == EASING_BEZIER) {
        cx1 = raw.easingParam1;
        cy1 = raw.easingParam2;
        cx2 = 1.0 - raw.easingParam1;
        cy2 = 1.0 - raw.easingParam2;
    }
    let easingId = easingTypeToId(raw.easingType);
    let easingMode = getEasingMode(raw.easingType);
    packed.w0 = packHalfs(startTime, duration);
    packed.w1 = packHalfs(startValue, endValue);
    packed.w2 = packHalfs(cx1, cy1);
    packed.w3 = packHalfs(cx2, cy2);
    packed.flags = packEasingFlags(easingId, easingMode);
    packedKeyframes[index] = packed;
}

// Sort keyframes by start time (parallel bitonic sort)
@compute @workgroup_size(64)
fn sortKeyframesByTime(@builtin(global_invocation_id) global_id: vec3<u32>,
                       @builtin(local_invocation_id) local_id: vec3<u32>) {
    let index = global_id.x;
    let count = arrayLength(&keyframeIndices);

    if (index >= count) {
        return;
    }

    // Initialize indices
    keyframeIndices[index] = index;

    // Bitonic sort would go here (simplified for now)
    // Full implementation would require multiple passes
}
`;

// Keyframe binary search shader for active keyframe lookup
export const KEYFRAME_SEARCH_SHADER = `
// Packed keyframe data for binary search (shared layout with interpolation)
struct PackedKeyframe {
    w0: u32,
    w1: u32,
    w2: u32,
    w3: u32,
    flags: u32,
}

// Search result
struct SearchResult {
    keyframeIndex: u32,
    isActive: u32,
    progress: f32,
    _pad: f32,
}

@group(0) @binding(0) var<storage, read> keyframes: array<PackedKeyframe>;
@group(0) @binding(1) var<storage, read> searchTimes: array<f32>;
@group(0) @binding(2) var<storage, read> keyframeOffsets: array<u32>; // Per-entity keyframe start offset
@group(0) @binding(3) var<storage, read> keyframeCounts: array<u32>;  // Per-entity keyframe count
@group(0) @binding(4) var<storage, read_write> results: array<SearchResult>;

var<workgroup> cachedOffsets: array<u32, 64>;
var<workgroup> cachedCounts: array<u32, 64>;

const ADAPTIVE_SEARCH_THRESHOLD: u32 = 20u;

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

fn getStartAndEndTime(kf: PackedKeyframe) -> vec2<f32> {
    let t = unpackHalfs(kf.w0);
    let v = unpackHalfs(kf.w1);
    let start = t.x;
    let duration = t.y;
    let endTime = start + duration;
    let _unused = v;
    return vec2<f32>(start, endTime);
}

fn linearSearchKeyframe(time: f32, startOffset: u32, count: u32) -> SearchResult {
    var result: SearchResult;
    result.keyframeIndex = 0u;
    result.isActive = 0u;
    result.progress = 0.0;

    if (count == 0u) {
        return result;
    }

    var found = false;
    var lastIndex = 0u;

    for (var i = 0u; i < count; i = i + 1u) {
        let kf = keyframes[startOffset + i];
        let times = getStartAndEndTime(kf);
        let start = times.x;
        let endTime = times.y;

        if (time >= start && time <= endTime) {
            result.keyframeIndex = startOffset + i;
            result.isActive = 1u;
            let duration = endTime - start;
            if (duration > 0.0) {
                result.progress = (time - start) / duration;
            }
            found = true;
            return result;
        }

        if (time > endTime) {
            lastIndex = i;
        }
    }

    if (!found) {
        let clampedIndex = lastIndex;
        let firstTimes = getStartAndEndTime(keyframes[startOffset]);
        if (time < firstTimes.x) {
            clampedIndex = 0u;
            result.progress = 0.0;
        } else {
            clampedIndex = min(lastIndex, count - 1u);
            result.progress = 1.0;
        }
        result.keyframeIndex = startOffset + clampedIndex;
    }

    return result;
}

// Binary search for active keyframe in packed keyframe buffer
fn binarySearchKeyframe(time: f32, startOffset: u32, count: u32) -> SearchResult {
    var result: SearchResult;
    result.keyframeIndex = 0u;
    result.isActive = 0u;
    result.progress = 0.0;

    if (count == 0u) {
        return result;
    }

    var left = 0u;
    var right = count;

    while (left < right) {
        let mid = (left + right) / 2u;
        let kf = keyframes[startOffset + mid];
        let times = getStartAndEndTime(kf);
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

@compute @workgroup_size(64)
fn findActiveKeyframes(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
) {
    let index = global_id.x;
    let entityCount = arrayLength(&searchTimes);

    if (index >= entityCount) {
        return;
    }

    let localIndex = local_id.x;

    cachedOffsets[localIndex] = keyframeOffsets[index];
    cachedCounts[localIndex] = keyframeCounts[index];

    workgroupBarrier();

    let time = searchTimes[index];
    let offset = cachedOffsets[localIndex];
    let count = cachedCounts[localIndex];

    results[index] = adaptiveSearchKeyframe(time, offset, count);
}
`;

export const KEYFRAME_SEARCH_SHADER_OPT = `
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

@group(0) @binding(0) var<storage, read> keyframes: array<PackedKeyframe>;
@group(0) @binding(1) var<storage, read> searchTimes: array<f32>;
@group(0) @binding(2) var<storage, read> keyframeOffsets: array<u32>;
@group(0) @binding(3) var<storage, read> keyframeCounts: array<u32>;
@group(0) @binding(4) var<storage, read_write> results: array<SearchResult>;

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

fn getStartAndEndTime(kf: PackedKeyframe) -> vec2<f32> {
    let t = unpackHalfs(kf.w0);
    let start = t.x;
    let duration = t.y;
    let endTime = start + duration;
    return vec2<f32>(start, endTime);
}

fn linearSearchKeyframeOptimized(time: f32, startOffset: u32, count: u32) -> SearchResult {
    var result: SearchResult;
    result.keyframeIndex = 0u;
    result.isActive = 0u;
    result.progress = 0.0;

    if (count == 0u) {
        return result;
    }

    var lastIndex = 0u;

    if (count <= PREFETCH_LIMIT_SMALL) {
        var starts: array<f32, PREFETCH_LIMIT_SMALL>;
        var ends: array<f32, PREFETCH_LIMIT_SMALL>;
        var i = 0u;
        while (i < count && i < PREFETCH_LIMIT_SMALL) {
            let kf = keyframes[startOffset + i];
            let times = getStartAndEndTime(kf);
            let s = times.x;
            let e = times.y;
            starts[i] = s;
            ends[i] = e;
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
        let kf = keyframes[startOffset + k];
        let times = getStartAndEndTime(kf);
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

    if (time < keyframes[startOffset].startTime) {
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

    if (count == 0u) {
        return result;
    }

    var left = 0u;
    var right = count;

    while (left < right) {
        let mid = (left + right) / 2u;
        let kf = keyframes[startOffset + mid];
        let times = getStartAndEndTime(kf);
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
fn findActiveKeyframes(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
) {
    let index = global_id.x;
    let entityCount = arrayLength(&searchTimes);

    if (index >= entityCount) {
        return;
    }

    let localIndex = local_id.x;

    cachedOffsets[localIndex] = keyframeOffsets[index];
    cachedCounts[localIndex] = keyframeCounts[index];

    workgroupBarrier();

    let time = searchTimes[index];
    let offset = cachedOffsets[localIndex];
    let count = cachedCounts[localIndex];

    results[index] = adaptiveSearchKeyframeOptimized(time, offset, count);
}
`;

export const KEYFRAME_INTERP_FROM_SEARCH_SHADER = `
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

@group(0) @binding(0) var<storage, read> keyframes: array<PackedKeyframe>;
@group(0) @binding(1) var<storage, read> results: array<SearchResult>;
@group(0) @binding(2) var<storage, read> outputIndices: array<u32>;
@group(0) @binding(3) var<storage, read_write> outputs: array<f32>;

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

fn getPackedTimes(kf: PackedKeyframe) -> vec2<f32> {
    let t = unpackHalfs(kf.w0);
    let start = t.x;
    let duration = t.y;
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

@compute @workgroup_size(64)
fn interpolateFromSearch(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let count = arrayLength(&results);
    if (index >= count) {
        return;
    }

    let res = results[index];
    let outIndex = outputIndices[index];

    if (res.isActive == 0u) {
        if (outIndex < arrayLength(&outputs)) {
            outputs[outIndex] = 0.0;
        }
        return;
    }

    let kf = keyframes[res.keyframeIndex];
    let times = getPackedTimes(kf);
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
`;

export const STRING_SEARCH_SHADER = `
struct StringSearchResult {
    index: u32,
    found: u32,
    _pad0: u32,
    _pad1: u32,
}

@group(0) @binding(0) var<storage, read> text: array<u32>;
@group(0) @binding(1) var<storage, read> pattern: array<u32>;
@group(0) @binding(2) var<storage, read_write> result: array<StringSearchResult>;

@compute @workgroup_size(64)
fn findSubstring(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gid = global_id.x;
    if (gid > 0u) {
        return;
    }

    let textLen = arrayLength(&text);
    let patLen = arrayLength(&pattern);

    var res: StringSearchResult;
    res.index = 0u;
    res.found = 0u;
    res._pad0 = 0u;
    res._pad1 = 0u;

    if (patLen == 0u || textLen == 0u || patLen > textLen) {
        result[0] = res;
        return;
    }

    for (var i = 0u; i <= textLen - patLen; i = i + 1u) {
        var matched = true;
        for (var j = 0u; j < patLen; j = j + 1u) {
            if (text[i + j] != pattern[j]) {
                matched = false;
                break;
            }
        }
        if (matched) {
            res.index = i;
            res.found = 1u;
            result[0] = res;
            return;
        }
    }

    result[0] = res;
}
`;

export interface RawKeyframeData {
  startTime: number;
  endTime: number;
  startValue: number;
  endValue: number;
  easingType: number;
  easingParam1?: number;
  easingParam2?: number;
}

export interface ChannelMapData {
  propertyHash: number;
  channelIndex: number;
  entityOffset: number;
  keyframeCount: number;
}

export const EASING_TYPE = {
  LINEAR: 0,
  EASE_IN_QUAD: 1,
  EASE_OUT_QUAD: 2,
  EASE_IN_OUT_QUAD: 3,
  EASE_IN_CUBIC: 4,
  EASE_OUT_CUBIC: 5,
  EASE_IN_OUT_CUBIC: 6,
  EASE_IN_QUART: 7,
  EASE_OUT_QUART: 8,
  EASE_IN_OUT_QUART: 9,
  EASE_IN_QUINT: 10,
  EASE_OUT_QUINT: 11,
  EASE_IN_OUT_QUINT: 12,
  EASE_IN_SINE: 13,
  EASE_OUT_SINE: 14,
  EASE_IN_OUT_SINE: 15,
  EASE_IN_EXPO: 16,
  EASE_OUT_EXPO: 17,
  EASE_IN_OUT_EXPO: 18,
  EASE_IN_CIRC: 19,
  EASE_OUT_CIRC: 20,
  EASE_IN_OUT_CIRC: 21,
  EASE_IN_BACK: 22,
  EASE_OUT_BACK: 23,
  EASE_IN_OUT_BACK: 24,
  EASE_IN_ELASTIC: 25,
  EASE_OUT_ELASTIC: 26,
  EASE_IN_OUT_ELASTIC: 27,
  EASE_IN_BOUNCE: 28,
  EASE_OUT_BOUNCE: 29,
  EASE_IN_OUT_BOUNCE: 30,
  BEZIER: 100,
  HOLD: 101,
} as const;

export const RAW_KEYFRAME_STRIDE = 8;
export const PACKED_KEYFRAME_STRIDE = 5;
export const CHANNEL_MAP_STRIDE = 4;
export const SEARCH_RESULT_STRIDE = 4;

export function packRawKeyframes(keyframes: RawKeyframeData[]): Float32Array {
  const data = new Float32Array(keyframes.length * RAW_KEYFRAME_STRIDE);
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const offset = i * RAW_KEYFRAME_STRIDE;
    data[offset + 0] = kf.startTime;
    data[offset + 1] = kf.endTime;
    data[offset + 2] = kf.startValue;
    data[offset + 3] = kf.endValue;
    // Store easingType as float (will be cast to u32 in shader)
    const uint32View = new Uint32Array(data.buffer, (offset + 4) * 4, 1);
    uint32View[0] = kf.easingType;
    data[offset + 5] = kf.easingParam1 ?? 0;
    data[offset + 6] = kf.easingParam2 ?? 0;
    data[offset + 7] = 0; // padding
  }
  return data;
}

export function packChannelMaps(maps: ChannelMapData[]): Uint32Array {
  const data = new Uint32Array(maps.length * CHANNEL_MAP_STRIDE);
  for (let i = 0; i < maps.length; i++) {
    const m = maps[i];
    const offset = i * CHANNEL_MAP_STRIDE;
    data[offset + 0] = m.propertyHash;
    data[offset + 1] = m.channelIndex;
    data[offset + 2] = m.entityOffset;
    data[offset + 3] = m.keyframeCount;
  }
  return data;
}

export function hashPropertyName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash >>> 0; // Convert to unsigned
}

export const PROPERTY_HASHES = {
  x: hashPropertyName('x'),
  y: hashPropertyName('y'),
  z: hashPropertyName('z'),
  rotation: hashPropertyName('rotation'),
  rotateX: hashPropertyName('rotateX'),
  rotateY: hashPropertyName('rotateY'),
  rotateZ: hashPropertyName('rotateZ'),
  scaleX: hashPropertyName('scaleX'),
  scaleY: hashPropertyName('scaleY'),
  scaleZ: hashPropertyName('scaleZ'),
  scale: hashPropertyName('scale'),
  opacity: hashPropertyName('opacity'),
  width: hashPropertyName('width'),
  height: hashPropertyName('height'),
} as const;

export function easingStringToType(easing: string | undefined): number {
  if (!easing) return EASING_TYPE.LINEAR;

  const easingMap: Record<string, number> = {
    linear: EASING_TYPE.LINEAR,
    easeInQuad: EASING_TYPE.EASE_IN_QUAD,
    easeOutQuad: EASING_TYPE.EASE_OUT_QUAD,
    easeInOutQuad: EASING_TYPE.EASE_IN_OUT_QUAD,
    easeInCubic: EASING_TYPE.EASE_IN_CUBIC,
    easeOutCubic: EASING_TYPE.EASE_OUT_CUBIC,
    easeInOutCubic: EASING_TYPE.EASE_IN_OUT_CUBIC,
    // ... add more as needed
  };

  return easingMap[easing] ?? EASING_TYPE.LINEAR;
}

export interface RawKeyframeGenerationOptions {
  timeInterval: number;
  maxSubdivisionsPerSegment?: number;
}

export type RawKeyframeValueEvaluator = (
  keyframe: {
    startTime: number;
    time: number;
    startValue: number;
    endValue: number;
    easing: unknown;
  },
  t: number,
) => number;

export function generateRawKeyframesForTrack(
  track: Array<{
    startTime: number;
    time: number;
    startValue: number;
    endValue: number;
    easing: unknown;
  }>,
  options: RawKeyframeGenerationOptions,
  evaluate: RawKeyframeValueEvaluator,
): RawKeyframeData[] {
  const result: RawKeyframeData[] = [];
  if (!Array.isArray(track) || track.length === 0) return result;
  const timeInterval = options.timeInterval > 0 ? options.timeInterval : 1;
  const maxSubs =
    options.maxSubdivisionsPerSegment && options.maxSubdivisionsPerSegment > 0
      ? options.maxSubdivisionsPerSegment
      : 4;
  for (let i = 0; i < track.length; i++) {
    const kf = track[i];
    const segStart = kf.startTime;
    const segEnd = kf.time;
    let duration = segEnd - segStart;
    if (!(duration > 0)) {
      const value = evaluate(kf, segStart);
      result.push({
        startTime: segStart,
        endTime: segStart,
        startValue: value,
        endValue: value,
        easingType: easingStringToType(typeof kf.easing === 'string' ? kf.easing : undefined),
        easingParam1: 0,
        easingParam2: 0,
      });
      continue;
    }
    let nSub = Math.ceil(duration / timeInterval);
    if (!(nSub > 0)) nSub = 1;
    if (nSub < 2 && maxSubs >= 2) nSub = 2;
    if (nSub > maxSubs) nSub = maxSubs;
    const subDuration = duration / nSub;
    for (let j = 0; j < nSub; j++) {
      const subStart = segStart + j * subDuration;
      let subEnd = subStart + subDuration;
      if (j === nSub - 1) subEnd = segEnd;
      const startValue = evaluate(kf, subStart);
      const endValue = evaluate(kf, subEnd);
      result.push({
        startTime: subStart,
        endTime: subEnd,
        startValue,
        endValue,
        easingType: easingStringToType(typeof kf.easing === 'string' ? kf.easing : undefined),
        easingParam1: 0,
        easingParam2: 0,
      });
    }
  }
  return result;
}

export interface ChannelInputDesc {
  property: string;
  keyframeCount: number;
}

export function buildChannelMapData(
  channels: ChannelInputDesc[],
  baseOffset: number,
): ChannelMapData[] {
  const result: ChannelMapData[] = [];
  let offset = baseOffset;
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const hash =
      (PROPERTY_HASHES as Record<string, number>)[c.property] ?? hashPropertyName(c.property);
    result.push({
      propertyHash: hash,
      channelIndex: i,
      entityOffset: offset,
      keyframeCount: c.keyframeCount,
    });
    offset += c.keyframeCount;
  }
  return result;
}

export interface ChannelTrackInput {
  property: string;
  track: Array<{
    startTime: number;
    time: number;
    startValue: number;
    endValue: number;
    easing: unknown;
  }>;
}

export function preprocessChannelsToRawAndMap(
  channels: ChannelTrackInput[],
  options: RawKeyframeGenerationOptions,
  evaluate: RawKeyframeValueEvaluator,
): { rawKeyframes: RawKeyframeData[]; channelMaps: ChannelMapData[] } {
  const rawKeyframes: RawKeyframeData[] = [];
  const channelDescs: ChannelInputDesc[] = [];
  let offset = 0;
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const raws = generateRawKeyframesForTrack(c.track, options, evaluate);
    const count = raws.length;
    for (let j = 0; j < count; j++) {
      rawKeyframes.push(raws[j]);
    }
    channelDescs.push({
      property: c.property,
      keyframeCount: count,
    });
    offset += count;
  }
  const channelMaps = buildChannelMapData(channelDescs, 0);
  return { rawKeyframes, channelMaps };
}
