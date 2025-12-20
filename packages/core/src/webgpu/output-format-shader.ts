/**
 * Multi-Channel Output Processing Shader (Phase 2.2)
 *
 * Handles various output formats and optimized memory layouts for
 * efficient GPU-to-CPU data transfer.
 */

// WGSL shader for output format conversion
export const OUTPUT_FORMAT_SHADER = `
// Output format types
const FORMAT_FLOAT: u32 = 0u;       // Raw float value
const FORMAT_COLOR_RGBA: u32 = 1u;  // RGBA color (0-255 packed into u32)
const FORMAT_COLOR_NORM: u32 = 2u;  // Normalized color (0-1 floats)
const FORMAT_ANGLE_DEG: u32 = 3u;   // Angle in degrees
const FORMAT_ANGLE_RAD: u32 = 4u;   // Angle in radians
const FORMAT_PERCENT: u32 = 5u;     // Percentage (0-100)
const FORMAT_MATRIX_2D: u32 = 6u;   // 2D transform matrix (6 floats)
const FORMAT_MATRIX_3D: u32 = 7u;   // 3D transform matrix (16 floats)

// Output channel descriptor
struct OutputChannel {
    sourceIndex: u32,   // Index in raw interpolation output
    formatType: u32,    // Output format type
    minValue: f32,      // For clamping/normalization
    maxValue: f32,      // For clamping/normalization
}

// Packed RGBA color output
struct PackedColor {
    rgba: u32,          // R(8) | G(8) | B(8) | A(8)
}

@group(0) @binding(0) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(1) var<storage, read> channels: array<OutputChannel>;
@group(0) @binding(2) var<storage, read_write> formattedOutputs: array<f32>;
@group(0) @binding(3) var<storage, read_write> packedColors: array<PackedColor>;

// Convert float to packed RGBA
fn floatToPackedRGBA(r: f32, g: f32, b: f32, a: f32) -> u32 {
    let ri = u32(clamp(r * 255.0, 0.0, 255.0));
    let gi = u32(clamp(g * 255.0, 0.0, 255.0));
    let bi = u32(clamp(b * 255.0, 0.0, 255.0));
    let ai = u32(clamp(a * 255.0, 0.0, 255.0));
    return (ri << 24u) | (gi << 16u) | (bi << 8u) | ai;
}

// Normalize value to 0-1 range
fn normalize(value: f32, minVal: f32, maxVal: f32) -> f32 {
    let range = maxVal - minVal;
    if (range <= 0.0) {
        return 0.0;
    }
    return clamp((value - minVal) / range, 0.0, 1.0);
}

// Convert degrees to radians
fn degToRad(deg: f32) -> f32 {
    return deg * 3.14159265 / 180.0;
}

// Convert radians to degrees
fn radToDeg(rad: f32) -> f32 {
    return rad * 180.0 / 3.14159265;
}

// Format single output value
@compute @workgroup_size(64)
fn formatOutputs(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let channelCount = arrayLength(&channels);

    if (index >= channelCount) {
        return;
    }

    let channel = channels[index];
    let rawValue = rawOutputs[channel.sourceIndex];

    var formattedValue = rawValue;

    switch (channel.formatType) {
        case FORMAT_FLOAT: {
            // Raw float, optionally clamped
            if (channel.minValue < channel.maxValue) {
                formattedValue = clamp(rawValue, channel.minValue, channel.maxValue);
            }
        }
        case FORMAT_COLOR_RGBA: {
            // Assume rawValue is a single channel, normalize to 0-255
            formattedValue = clamp(rawValue * 255.0, 0.0, 255.0);
        }
        case FORMAT_COLOR_NORM: {
            // Normalize to 0-1
            formattedValue = normalize(rawValue, channel.minValue, channel.maxValue);
        }
        case FORMAT_ANGLE_DEG: {
            // Convert to degrees if needed, wrap to 0-360
            formattedValue = rawValue % 360.0;
            if (formattedValue < 0.0) {
                formattedValue = formattedValue + 360.0;
            }
        }
        case FORMAT_ANGLE_RAD: {
            // Convert to radians, wrap to 0-2π
            let twoPi = 6.28318530;
            formattedValue = rawValue % twoPi;
            if (formattedValue < 0.0) {
                formattedValue = formattedValue + twoPi;
            }
        }
        case FORMAT_PERCENT: {
            // Convert to percentage
            formattedValue = normalize(rawValue, channel.minValue, channel.maxValue) * 100.0;
        }
        default: {
            formattedValue = rawValue;
        }
    }

    formattedOutputs[index] = formattedValue;
}
`;

// Optimized memory layout shader for batch output
export const BATCH_OUTPUT_SHADER = `
// Entity output descriptor
struct EntityOutput {
    entityId: u32,
    channelOffset: u32, // Offset in output array
    channelCount: u32,  // Number of channels for this entity
    _pad: u32,
}

// Interleaved output for cache-friendly access
struct InterleavedOutput {
    entityId: u32,
    x: f32,
    y: f32,
    rotation: f32,
    scaleX: f32,
    scaleY: f32,
    opacity: f32,
    _pad: f32,
}

@group(0) @binding(0) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(1) var<storage, read> entityDescs: array<EntityOutput>;
@group(0) @binding(2) var<storage, read_write> interleavedOutputs: array<InterleavedOutput>;

// Pack outputs into interleaved format for efficient CPU consumption
@compute @workgroup_size(64)
fn packInterleavedOutputs(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&entityDescs);

    if (index >= entityCount) {
        return;
    }

    let desc = entityDescs[index];
    let offset = desc.channelOffset;
    let count = desc.channelCount;

    var output: InterleavedOutput;
    output.entityId = desc.entityId;

    // Map channels to interleaved output (assumes standard channel order)
    output.x = select(0.0, rawOutputs[offset], count > 0u);
    output.y = select(0.0, rawOutputs[offset + 1u], count > 1u);
    output.rotation = select(0.0, rawOutputs[offset + 2u], count > 2u);
    output.scaleX = select(1.0, rawOutputs[offset + 3u], count > 3u);
    output.scaleY = select(1.0, rawOutputs[offset + 4u], count > 4u);
    output.opacity = select(1.0, rawOutputs[offset + 5u], count > 5u);

    interleavedOutputs[index] = output;
}
`;

// Structure-of-Arrays (SoA) output shader for SIMD-friendly access
export const SOA_OUTPUT_SHADER = `
// SoA output buffers
@group(0) @binding(0) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(1) var<storage, read> channelStride: u32;
@group(0) @binding(2) var<storage, read_write> xValues: array<f32>;
@group(0) @binding(3) var<storage, read_write> yValues: array<f32>;
@group(0) @binding(4) var<storage, read_write> rotationValues: array<f32>;
@group(0) @binding(5) var<storage, read_write> scaleXValues: array<f32>;
@group(0) @binding(6) var<storage, read_write> scaleYValues: array<f32>;
@group(0) @binding(7) var<storage, read_write> opacityValues: array<f32>;

// Transpose AoS to SoA for SIMD-friendly CPU access
@compute @workgroup_size(64)
fn transposeToSoA(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let entityCount = arrayLength(&xValues);

    if (index >= entityCount) {
        return;
    }

    let baseOffset = index * channelStride;

    xValues[index] = rawOutputs[baseOffset];
    yValues[index] = rawOutputs[baseOffset + 1u];
    rotationValues[index] = rawOutputs[baseOffset + 2u];
    scaleXValues[index] = rawOutputs[baseOffset + 3u];
    scaleYValues[index] = rawOutputs[baseOffset + 4u];
    opacityValues[index] = rawOutputs[baseOffset + 5u];
}
`;

/**
 * Output format types
 */
export const OUTPUT_FORMAT = {
  FLOAT: 0,
  COLOR_RGBA: 1,
  COLOR_NORM: 2,
  ANGLE_DEG: 3,
  ANGLE_RAD: 4,
  PERCENT: 5,
  MATRIX_2D: 6,
  MATRIX_3D: 7,
} as const;

/**
 * Output channel descriptor
 */
export interface OutputChannelDesc {
  sourceIndex: number;
  formatType: number;
  minValue?: number;
  maxValue?: number;
}

/**
 * Interleaved output data
 */
export interface InterleavedOutputData {
  entityId: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

// Data layout constants
export const OUTPUT_CHANNEL_STRIDE = 4; // 4 values per channel descriptor
export const INTERLEAVED_OUTPUT_STRIDE = 8; // 8 values per interleaved output

/**
 * Pack output channel descriptors for GPU
 */
export function packOutputChannels(channels: OutputChannelDesc[]): Float32Array {
  const data = new Float32Array(channels.length * OUTPUT_CHANNEL_STRIDE);
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const offset = i * OUTPUT_CHANNEL_STRIDE;
    // Store as float but will be read as u32 in shader
    data[offset + 0] = c.sourceIndex;
    data[offset + 1] = c.formatType;
    data[offset + 2] = c.minValue ?? 0;
    data[offset + 3] = c.maxValue ?? 1;
  }
  return data;
}

/**
 * Unpack interleaved outputs from GPU
 */
export function unpackInterleavedOutputs(data: Float32Array): InterleavedOutputData[] {
  const count = data.length / INTERLEAVED_OUTPUT_STRIDE;
  const results: InterleavedOutputData[] = [];

  // Create a Uint32Array view for entityId
  const uint32View = new Uint32Array(data.buffer);

  for (let i = 0; i < count; i++) {
    const offset = i * INTERLEAVED_OUTPUT_STRIDE;
    results.push({
      entityId: uint32View[offset],
      x: data[offset + 1],
      y: data[offset + 2],
      rotation: data[offset + 3],
      scaleX: data[offset + 4],
      scaleY: data[offset + 5],
      opacity: data[offset + 6],
    });
  }
  return results;
}

/**
 * Convert packed RGBA to CSS color string
 */
export function packedRGBAToCSS(packed: number): string {
  const r = (packed >> 24) & 0xff;
  const g = (packed >> 16) & 0xff;
  const b = (packed >> 8) & 0xff;
  const a = packed & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/**
 * Create standard transform channel mapping
 */
export function createStandardChannelMapping(): OutputChannelDesc[] {
  return [
    { sourceIndex: 0, formatType: OUTPUT_FORMAT.FLOAT }, // x
    { sourceIndex: 1, formatType: OUTPUT_FORMAT.FLOAT }, // y
    { sourceIndex: 2, formatType: OUTPUT_FORMAT.ANGLE_DEG }, // rotation
    { sourceIndex: 3, formatType: OUTPUT_FORMAT.FLOAT, minValue: 0, maxValue: 10 }, // scaleX
    { sourceIndex: 4, formatType: OUTPUT_FORMAT.FLOAT, minValue: 0, maxValue: 10 }, // scaleY
    { sourceIndex: 5, formatType: OUTPUT_FORMAT.COLOR_NORM, minValue: 0, maxValue: 1 }, // opacity
  ];
}
