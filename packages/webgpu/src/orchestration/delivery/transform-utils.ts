/**
 * Transform String Utilities
 *
 * Builds CSS transform strings from GPU-computed values.
 */

import { getGPUModuleSync, OUTPUT_FORMAT } from '../../bridge';

export function buildMatrix2DTransformString(
  values: Float32Array,
  base: number,
  stride: number,
  channelIndices: number[],
): string | null {
  if (stride <= 0) return null;
  if (channelIndices.length !== 6) return null;
  const maxIndex = Math.max(
    channelIndices[0],
    channelIndices[1],
    channelIndices[2],
    channelIndices[3],
    channelIndices[4],
    channelIndices[5],
  );
  const end = base + maxIndex;
  if (end < 0 || end >= values.length) return null;

  const a = values[base + channelIndices[0]];
  const b = values[base + channelIndices[1]];
  const c = values[base + channelIndices[2]];
  const d = values[base + channelIndices[3]];
  const e = values[base + channelIndices[4]];
  const f = values[base + channelIndices[5]];
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(c) ||
    !Number.isFinite(d) ||
    !Number.isFinite(e) ||
    !Number.isFinite(f)
  ) {
    return null;
  }
  return `matrix(${a},${-b},${-c},${d},${e},${f})`;
}

export function buildMatrix3DTransformString(
  values: Float32Array,
  base: number,
  stride: number,
  channelIndices: number[],
): string | null {
  if (stride <= 0) return null;
  if (channelIndices.length !== 16) return null;
  let maxIndex = 0;
  for (let i = 0; i < 16; i++) {
    maxIndex = Math.max(maxIndex, channelIndices[i] ?? 0);
  }
  const end = base + maxIndex;
  if (end < 0 || end >= values.length) return null;

  const parts: string[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    const v = values[base + channelIndices[i]];
    if (!Number.isFinite(v)) return null;
    parts[i] = String(v);
  }
  return `matrix3d(${parts.join(',')})`;
}

const packedRGBAToCSS = (
  ...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['packedRGBAToCSS']>
) => {
  const gpu = getGPUModuleSync();
  if (!gpu) {
    throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  }
  return gpu.packedRGBAToCSS(...args);
};

const unpackHalf2 = (
  ...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['unpackHalf2']>
) => {
  const gpu = getGPUModuleSync();
  if (!gpu) {
    throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  }
  return gpu.unpackHalf2(...args);
};

export { OUTPUT_FORMAT, packedRGBAToCSS, unpackHalf2 };
