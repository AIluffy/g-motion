/**
 * Output Format Pipeline
 */

import { OUTPUT_FORMAT_SHADER } from '../output-format-shader';

export let outputFormatPipeline: GPUComputePipeline | null = null;
export let outputFormatBindGroupLayout: GPUBindGroupLayout | null = null;

export function __resetOutputFormatPassForTests(): void {
  outputFormatPipeline = null;
  outputFormatBindGroupLayout = null;
}

export function resetOutputFormatPassState(): void {
  outputFormatPipeline = null;
  outputFormatBindGroupLayout = null;
}

export async function getOutputFormatPipeline(
  device: GPUDevice,
): Promise<GPUComputePipeline | null> {
  if (outputFormatPipeline && outputFormatBindGroupLayout) {
    return outputFormatPipeline;
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

  outputFormatBindGroupLayout = bindGroupLayout;
  outputFormatPipeline = pipeline;
  return pipeline;
}
