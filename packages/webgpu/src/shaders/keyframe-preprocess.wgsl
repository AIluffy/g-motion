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

const EASING_BUILTIN_MAX_ID: u32 = 30u;
const EASING_BEZIER: u32 = 100u;
const EASING_HOLD: u32 = 101u;

@group(0) @binding(0) var<storage, read> rawKeyframes: array<RawKeyframe>;
@group(0) @binding(1) var<storage, read> channelMaps: array<ChannelMap>;
@group(0) @binding(2) var<storage, read_write> packedKeyframes: array<PackedKeyframe>;
@group(0) @binding(3) var<storage, read_write> keyframeIndices: array<u32>; // Sorted indices
@group(0) @binding(4) var<storage, read_write> keyframeStartTimes: array<f32>;
@group(0) @binding(5) var<storage, read_write> keyframeDurations: array<f32>;

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
    if (easingType <= EASING_BUILTIN_MAX_ID) {
        return easingType;
    }
    return 0u;
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

    if (index < arrayLength(&keyframeStartTimes)) {
        keyframeStartTimes[index] = startTime;
    }
    if (index < arrayLength(&keyframeDurations)) {
        keyframeDurations[index] = duration;
    }
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
