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
@group(0) @binding(1) var<storage, read> keyframeStartTimes: array<f32>;
@group(0) @binding(2) var<storage, read> keyframeDurations: array<f32>;
@group(0) @binding(3) var<storage, read> searchTimes: array<f32>;
@group(0) @binding(4) var<storage, read> keyframeOffsets: array<u32>; // Per-entity keyframe start offset
@group(0) @binding(5) var<storage, read> keyframeCounts: array<u32>;  // Per-entity keyframe count
@group(0) @binding(6) var<storage, read_write> results: array<SearchResult>;

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

fn getStartAndEndTime(keyframeIndex: u32) -> vec2<f32> {
    let start = keyframeStartTimes[keyframeIndex];
    let duration = keyframeDurations[keyframeIndex];
    return vec2<f32>(start, start + duration);
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
