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
const FORMAT_PACKED_HALF2: u32 = 8u; // Two f16 packed into u32, bitcast to f32

struct OutputFormatParams {
    usedRawValueCount: u32,
    rawStride: u32,
    outputStride: u32,
    _pad: u32,
}

// Output channel descriptor
struct OutputChannel {
    sourceIndex: u32,   // Index in raw interpolation output
    formatType: u32,    // Output format type
    minValue: f32,      // For clamping/normalization
    maxValue: f32,      // For clamping/normalization
}

@group(0) @binding(0) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(1) var<storage, read> channels: array<OutputChannel>;
@group(0) @binding(2) var<storage, read_write> formattedOutputs: array<f32>;
@group(0) @binding(3) var<uniform> params: OutputFormatParams;

// Convert float to packed RGBA
fn floatToPackedRGBA(r: f32, g: f32, b: f32, a: f32) -> u32 {
    let ri = u32(clamp(r * 255.0, 0.0, 255.0));
    let gi = u32(clamp(g * 255.0, 0.0, 255.0));
    let bi = u32(clamp(b * 255.0, 0.0, 255.0));
    let ai = u32(clamp(a * 255.0, 0.0, 255.0));
    return (ri << 24u) | (gi << 16u) | (bi << 8u) | ai;
}

fn floatToHalfBits(value: f32) -> u32 {
    let fbits = bitcast<u32>(value);
    let sign = (fbits >> 16u) & 0x8000u;
    let exp = (fbits >> 23u) & 0xffu;
    var mantissa = fbits & 0x7fffffu;
    if (exp == 0xffu) {
        if (mantissa != 0u) {
            return sign | 0x7e00u;
        }
        return sign | 0x7c00u;
    }
    var exponent = i32(exp) - 127 + 15;
    if (exponent <= 0) {
        if (exponent < -10) {
            return sign;
        }
        mantissa = (mantissa | 0x800000u) >> u32(1 - exponent);
        return sign | (mantissa >> 13u);
    }
    if (exponent >= 31) {
        return sign | 0x7c00u;
    }
    return sign | (u32(exponent) << 10u) | (mantissa >> 13u);
}

fn packHalfs(a: f32, b: f32) -> u32 {
    let ha = floatToHalfBits(a) & 0xffffu;
    let hb = floatToHalfBits(b) & 0xffffu;
    return ha | (hb << 16u);
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

fn linearToSRGB(c: f32) -> f32 {
    if (c <= 0.0031308) {
        return 12.92 * c;
    }
    return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn sRGBToLinear(c: f32) -> f32 {
    if (c <= 0.04045) {
        return c / 12.92;
    }
    return pow((c + 0.055) / 1.055, 2.4);
}

// Format single output value
@compute @workgroup_size(64)
fn formatOutputs(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let rawStride = params.rawStride;
    let outputStride = params.outputStride;
    let usedRawValueCount = params.usedRawValueCount;

    if (rawStride == 0u || outputStride == 0u) {
        return;
    }

    let usedEntityCount = usedRawValueCount / rawStride;
    let usedOutputCount = usedEntityCount * outputStride;

    if (index >= usedOutputCount) {
        return;
    }

    let channelIndex = index % outputStride;
    let entityIndex = index / outputStride;
    let rawEntityBase = entityIndex * rawStride;
    let channel = channels[channelIndex];
    let rawIndex = rawEntityBase + channel.sourceIndex;
    if (rawIndex >= usedRawValueCount) {
        return;
    }
    let rawValue = rawOutputs[rawIndex];

    var formattedValue = rawValue;

    switch (channel.formatType) {
        case FORMAT_FLOAT: {
            // Raw float, optionally clamped
            if (channel.minValue < channel.maxValue) {
                formattedValue = clamp(rawValue, channel.minValue, channel.maxValue);
            }
        }
        case FORMAT_COLOR_RGBA: {
            if (rawEntityBase + channel.sourceIndex + 3u >= usedRawValueCount) {
                formattedOutputs[index] = 0.0;
                return;
            }
            let r0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 0u], channel.minValue, channel.maxValue);
            let g0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 1u], channel.minValue, channel.maxValue);
            let b0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 2u], channel.minValue, channel.maxValue);
            let a0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 3u], channel.minValue, channel.maxValue);

            let r = linearToSRGB(clamp(r0, 0.0, 1.0));
            let g = linearToSRGB(clamp(g0, 0.0, 1.0));
            let b = linearToSRGB(clamp(b0, 0.0, 1.0));
            let a = clamp(a0, 0.0, 1.0);

            let packed = floatToPackedRGBA(r, g, b, a);
            formattedValue = bitcast<f32>(packed);
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
            formattedValue = normalize(rawValue, channel.minValue, channel.maxValue);
        }
        case FORMAT_MATRIX_2D: {
            formattedValue = rawValue;
        }
        case FORMAT_MATRIX_3D: {
            formattedValue = rawValue;
        }
        case FORMAT_PACKED_HALF2: {
            if (rawEntityBase + channel.sourceIndex + 1u >= usedRawValueCount) {
                formattedOutputs[index] = 0.0;
                return;
            }
            var a = rawOutputs[rawEntityBase + channel.sourceIndex + 0u];
            var b = rawOutputs[rawEntityBase + channel.sourceIndex + 1u];
            if (channel.sourceIndex == 2u) {
                a = a % 360.0;
                if (a < 0.0) {
                    a = a + 360.0;
                }
                b = clamp(b, 0.0, 10.0);
            } else if (channel.sourceIndex == 4u) {
                a = clamp(a, 0.0, 10.0);
                b = clamp(b, 0.0, 1.0);
            }
            let packed = packHalfs(a, b);
            formattedValue = bitcast<f32>(packed);
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
  PACKED_HALF2: 8,
} as const;

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function linearToSRGB(v: number): number {
  if (v <= 0.0031308) {
    return 12.92 * v;
  }
  return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function sRGBToLinear(v: number): number {
  if (v <= 0.04045) {
    return v / 12.92;
  }
  return Math.pow((v + 0.055) / 1.055, 2.4);
}

export function formatOutputValue(
  formatType: number,
  rawValue: number,
  minValue = 0,
  maxValue = 1,
): number {
  let value = rawValue;
  if (formatType === OUTPUT_FORMAT.FLOAT) {
    if (minValue < maxValue) {
      if (value < minValue) value = minValue;
      else if (value > maxValue) value = maxValue;
    }
    return value;
  }
  if (formatType === OUTPUT_FORMAT.COLOR_RGBA) {
    const range = maxValue - minValue;
    let norm = 0;
    if (range > 0) {
      norm = (value - minValue) / range;
      if (norm < 0) norm = 0;
      else if (norm > 1) norm = 1;
    }
    const srgb = linearToSRGB(clamp01(norm));
    return packNormalizedRGBA(srgb, srgb, srgb, 1) >>> 0;
  }
  if (formatType === OUTPUT_FORMAT.COLOR_NORM) {
    const range = maxValue - minValue;
    if (range <= 0) return 0;
    let norm = (value - minValue) / range;
    if (norm < 0) norm = 0;
    else if (norm > 1) norm = 1;
    return norm;
  }
  if (formatType === OUTPUT_FORMAT.ANGLE_DEG) {
    let deg = value % 360;
    if (deg < 0) deg += 360;
    return deg;
  }
  if (formatType === OUTPUT_FORMAT.ANGLE_RAD) {
    const twoPi = Math.PI * 2;
    let rad = value % twoPi;
    if (rad < 0) rad += twoPi;
    return rad;
  }
  if (formatType === OUTPUT_FORMAT.PERCENT) {
    const range = maxValue - minValue;
    if (range <= 0) return 0;
    let norm = (value - minValue) / range;
    if (norm < 0) norm = 0;
    else if (norm > 1) norm = 1;
    return norm;
  }
  return value;
}

export function packNormalizedRGBA(r: number, g: number, b: number, a: number): number {
  const rc = Math.round(clamp01(r) * 255);
  const gc = Math.round(clamp01(g) * 255);
  const bc = Math.round(clamp01(b) * 255);
  const ac = Math.round(clamp01(a) * 255);
  return ((rc & 0xff) << 24) | ((gc & 0xff) << 16) | ((bc & 0xff) << 8) | (ac & 0xff);
}

export function unpackNormalizedRGBA(packed: number): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  const r = (packed >> 24) & 0xff;
  const g = (packed >> 16) & 0xff;
  const b = (packed >> 8) & 0xff;
  const a = packed & 0xff;
  return {
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: a / 255,
  };
}

function halfToFloat(half: number): number {
  const sign = (half & 0x8000) >> 15;
  const exponent = (half & 0x7c00) >> 10;
  const mantissa = half & 0x03ff;
  if (exponent === 0) {
    if (mantissa === 0) {
      return sign === 1 ? -0.0 : 0.0;
    }
    return (sign ? -1 : 1) * Math.pow(2, -14) * (mantissa / 1024);
  }
  if (exponent === 31) {
    if (mantissa === 0) {
      return sign === 1 ? -Infinity : Infinity;
    }
    return NaN;
  }
  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

export function unpackHalf2(packed: number): [number, number] {
  const lo = packed & 0xffff;
  const hi = (packed >>> 16) & 0xffff;
  return [halfToFloat(lo), halfToFloat(hi)];
}

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
export function packOutputChannels(channels: OutputChannelDesc[]): ArrayBuffer {
  const buffer = new ArrayBuffer(channels.length * OUTPUT_CHANNEL_STRIDE * 4);
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const base = i * OUTPUT_CHANNEL_STRIDE;
    u32[base + 0] = (c.sourceIndex >>> 0) as unknown as number;
    u32[base + 1] = (c.formatType >>> 0) as unknown as number;
    f32[base + 2] = c.minValue ?? 0;
    f32[base + 3] = c.maxValue ?? 1;
  }
  return buffer;
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
  const { r, g, b, a } = unpackNormalizedRGBA(packed);
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(b * 255);
  return `rgba(${ri}, ${gi}, ${bi}, ${a.toFixed(3)})`;
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
