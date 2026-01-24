import { getWebGPUEngine } from './engine';
import type { WorkgroupSize } from './pipeline-manager';

export function cachePipeline(
  device: GPUDevice,
  workgroupSize: WorkgroupSize,
  pipeline: GPUComputePipeline,
): void {
  getWebGPUEngine().pipelineManager.cachePipeline(device, workgroupSize, pipeline);
}

export async function getPipelineForWorkgroup(
  device: GPUDevice,
  workgroupHint: number,
  cacheId: string = 'default',
): Promise<GPUComputePipeline | null> {
  return getWebGPUEngine().pipelineManager.getPipelineForWorkgroup(device, workgroupHint, cacheId);
}

export function clearPipelineCache(device?: GPUDevice): void {
  getWebGPUEngine().pipelineManager.clearPipelineCache(device);
}

export function selectWorkgroupSize(workgroupHint: number): WorkgroupSize {
  return getWebGPUEngine().pipelineManager.selectWorkgroupSize(workgroupHint);
}

export async function precompileWorkgroupPipelines(
  device: GPUDevice,
  shaderCode: string,
  bindGroupLayoutEntries: any[],
  entryPoint: string = 'main',
  cacheId: string = 'default',
): Promise<boolean> {
  return getWebGPUEngine().pipelineManager.precompileWorkgroupPipelines(
    device,
    shaderCode,
    bindGroupLayoutEntries,
    entryPoint,
    cacheId,
  );
}

export type { WorkgroupSize };
