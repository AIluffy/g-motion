/**
 * Multi-Channel Output Processing Shader (Phase 2.2)
 *
 * Handles various output formats and optimized memory layouts for
 * efficient GPU-to-CPU data transfer.
 */

import outputFormatShaderCode from './shaders/output-format.wgsl?raw';
import batchOutputShaderCode from './shaders/batch-output.wgsl?raw';
import soaOutputShaderCode from './shaders/soa-output.wgsl?raw';

// WGSL shader for output format conversion
export const OUTPUT_FORMAT_SHADER = outputFormatShaderCode;

// Optimized memory layout shader for batch output
export const BATCH_OUTPUT_SHADER = batchOutputShaderCode;

// Structure-of-Arrays (SoA) output shader for SIMD-friendly access
export const SOA_OUTPUT_SHADER = soaOutputShaderCode;

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
