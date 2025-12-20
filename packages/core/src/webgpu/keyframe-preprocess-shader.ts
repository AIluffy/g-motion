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
    startTime: f32,
    duration: f32,
    startValue: f32,
    endValue: f32,
    easingId: f32,
    bezierCx1: f32,
    bezierCy1: f32,
    bezierCx2: f32,
    bezierCy2: f32,
    easingMode: f32,
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

// Convert easing type to shader easing ID
fn easingTypeToId(easingType: u32) -> f32 {
    switch (easingType) {
        case EASING_LINEAR: { return 0.0; }
        case EASING_EASE_IN_QUAD: { return 1.0; }
        case EASING_EASE_OUT_QUAD: { return 2.0; }
        case EASING_EASE_IN_OUT_QUAD: { return 3.0; }
        case EASING_EASE_IN_CUBIC: { return 4.0; }
        case EASING_EASE_OUT_CUBIC: { return 5.0; }
        case EASING_EASE_IN_OUT_CUBIC: { return 6.0; }
        // ... more easing types
        default: { return 0.0; }
    }
}

// Get easing mode from type
fn getEasingMode(easingType: u32) -> f32 {
    if (easingType == EASING_BEZIER) {
        return 1.0; // BEZIER mode
    } else if (easingType == EASING_HOLD) {
        return 2.0; // HOLD mode
    }
    return 0.0; // STANDARD mode
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
    packed.startTime = raw.startTime;
    packed.duration = raw.endTime - raw.startTime;
    packed.startValue = raw.startValue;
    packed.endValue = raw.endValue;
    packed.easingId = easingTypeToId(raw.easingType);
    packed.easingMode = getEasingMode(raw.easingType);

    // Set bezier control points (default to linear if not bezier)
    if (raw.easingType == EASING_BEZIER) {
        packed.bezierCx1 = raw.easingParam1;
        packed.bezierCy1 = raw.easingParam2;
        // Note: Would need additional params for full bezier
        packed.bezierCx2 = 1.0 - raw.easingParam1;
        packed.bezierCy2 = 1.0 - raw.easingParam2;
    } else {
        packed.bezierCx1 = 0.0;
        packed.bezierCy1 = 0.0;
        packed.bezierCx2 = 1.0;
        packed.bezierCy2 = 1.0;
    }

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
// Keyframe data for binary search
struct KeyframeData {
    startTime: f32,
    endTime: f32,
    _pad1: f32,
    _pad2: f32,
}

// Search result
struct SearchResult {
    keyframeIndex: u32,
    isActive: u32,      // 1 if time is within keyframe, 0 otherwise
    progress: f32,      // Progress within keyframe (0-1)
    _pad: f32,
}

@group(0) @binding(0) var<storage, read> keyframes: array<KeyframeData>;
@group(0) @binding(1) var<storage, read> searchTimes: array<f32>;
@group(0) @binding(2) var<storage, read> keyframeOffsets: array<u32>; // Per-entity keyframe start offset
@group(0) @binding(3) var<storage, read> keyframeCounts: array<u32>;  // Per-entity keyframe count
@group(0) @binding(4) var<storage, read_write> results: array<SearchResult>;

// Binary search for active keyframe
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

    // Binary search for keyframe containing time
    while (left < right) {
        let mid = (left + right) / 2u;
        let kf = keyframes[startOffset + mid];

        if (time < kf.startTime) {
            right = mid;
        } else if (time > kf.endTime) {
            left = mid + 1u;
        } else {
            // Found active keyframe
            result.keyframeIndex = startOffset + mid;
            result.isActive = 1u;
            let duration = kf.endTime - kf.startTime;
            if (duration > 0.0) {
                result.progress = (time - kf.startTime) / duration;
            }
            return result;
        }
    }

    // Time is between keyframes or outside range
    if (left > 0u && left < count) {
        // Use previous keyframe (hold at end value)
        result.keyframeIndex = startOffset + left - 1u;
        result.progress = 1.0;
    } else if (left == 0u && count > 0u) {
        // Before first keyframe
        result.keyframeIndex = startOffset;
        result.progress = 0.0;
    }

    return result;
}

@compute @workgroup_size(64)
fn findActiveKeyframes(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&searchTimes);

    if (index >= entityCount) {
        return;
    }

    let time = searchTimes[index];
    let offset = keyframeOffsets[index];
    let count = keyframeCounts[index];

    results[index] = binarySearchKeyframe(time, offset, count);
}
`;

/**
 * Raw keyframe data from CPU
 */
export interface RawKeyframeData {
  startTime: number;
  endTime: number;
  startValue: number;
  endValue: number;
  easingType: number;
  easingParam1?: number;
  easingParam2?: number;
}

/**
 * Channel mapping descriptor
 */
export interface ChannelMapData {
  propertyHash: number;
  channelIndex: number;
  entityOffset: number;
  keyframeCount: number;
}

/**
 * Easing type constants
 */
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

// Data layout constants
export const RAW_KEYFRAME_STRIDE = 8;
export const PACKED_KEYFRAME_STRIDE = 10;
export const CHANNEL_MAP_STRIDE = 4;
export const SEARCH_RESULT_STRIDE = 4;

/**
 * Pack raw keyframes for GPU preprocessing
 */
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

/**
 * Pack channel mappings for GPU
 */
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

/**
 * Hash property name for GPU lookup
 */
export function hashPropertyName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash >>> 0; // Convert to unsigned
}

/**
 * Create property hash map for common properties
 */
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

/**
 * Convert easing string to type ID
 */
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
