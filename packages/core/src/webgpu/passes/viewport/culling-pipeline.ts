/**
 * Viewport Culling Pipeline
 */

import { ADVANCED_CULLING_OUTPUT_COMPACT_SHADER } from '../../../webgpu/culling-shader';

// Pipeline cache (exported for use by pass files)
export let cullingCompactPipeline: GPUComputePipeline | null = null;
export let cullingCompactBindGroupLayout: GPUBindGroupLayout | null = null;

export function __resetViewportCullingPassForTests(): void {
  cullingCompactPipeline = null;
  cullingCompactBindGroupLayout = null;
}

export async function getCullingCompactPipeline(
  device: GPUDevice,
): Promise<GPUComputePipeline | null> {
  if (cullingCompactPipeline && cullingCompactBindGroupLayout) {
    return cullingCompactPipeline;
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

  cullingCompactBindGroupLayout = bindGroupLayout;
  cullingCompactPipeline = pipeline;
  return pipeline;
}
