/**
 * Viewport Culling Pipeline
 */

import { ADVANCED_CULLING_OUTPUT_COMPACT_SHADER } from '../../shaders/culling-shader';

type CullingPipelineState = {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
};

let cullingCompactCache = new WeakMap<GPUDevice, CullingPipelineState>();

export function __resetViewportCullingPassForTests(): void {
  cullingCompactCache = new WeakMap();
}

export function clearViewportCullingPipelineCache(device: GPUDevice): void {
  cullingCompactCache.delete(device);
}

export async function getCullingCompactPipeline(
  device: GPUDevice,
): Promise<CullingPipelineState | null> {
  const cached = cullingCompactCache.get(device);
  if (cached) {
    return cached;
  }

  const shaderModule = device.createShaderModule({
    code: ADVANCED_CULLING_OUTPUT_COMPACT_SHADER,
    label: 'motion-culling-compact-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-culling-compact-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'uniform' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 4, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 5, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 6, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 7, visibility: 4, buffer: { type: 'uniform' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-culling-compact-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-culling-compact-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'cullAndCompact' },
  });

  const state = { pipeline, bindGroupLayout };
  cullingCompactCache.set(device, state);
  return state;
}
