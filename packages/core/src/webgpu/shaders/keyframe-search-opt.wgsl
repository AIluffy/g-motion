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
