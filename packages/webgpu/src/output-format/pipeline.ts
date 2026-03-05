/**
 * Output Format Pipeline
 */

import { OUTPUT_FORMAT_SHADER } from '../shaders/output-format-shader';

type OutputFormatPipelineState = {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
};

let outputFormatCache = new WeakMap<GPUDevice, OutputFormatPipelineState>();

export function __resetOutputFormatPassForTests(): void {
  outputFormatCache = new WeakMap();
}

export function resetOutputFormatPassState(): void {
  outputFormatCache = new WeakMap();
}

export function clearOutputFormatPipelineCache(device: GPUDevice): void {
  outputFormatCache.delete(device);
}

export async function getOutputFormatPipeline(
  device: GPUDevice,
): Promise<OutputFormatPipelineState | null> {
  const cached = outputFormatCache.get(device);
  if (cached) {
    return cached;
  }

  const shaderModule = device.createShaderModule({
    code: OUTPUT_FORMAT_SHADER,
    label: 'motion-output-format-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-output-format-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'uniform' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-output-format-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-output-format-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'formatOutputs' },
  });

  const state = { pipeline, bindGroupLayout };
  outputFormatCache.set(device, state);
  return state;
}
