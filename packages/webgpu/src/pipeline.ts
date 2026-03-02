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
  archetypeId?: string,
): Promise<GPUComputePipeline | null> {
  return getWebGPUEngine().pipelineManager.getPipelineForWorkgroup(
    device,
    workgroupHint,
    cacheId,
    archetypeId,
  );
}

export function clearPipelineCache(device?: GPUDevice): void {
  getWebGPUEngine().pipelineManager.clearPipelineCache(device);
}

export function selectWorkgroupSize(workgroupHint: number): WorkgroupSize;
export function selectWorkgroupSize(archetypeId: string, entityCount: number): WorkgroupSize;
export function selectWorkgroupSize(arg1: number | string, arg2?: number): WorkgroupSize {
  if (typeof arg1 === 'string') {
    return getWebGPUEngine().pipelineManager.selectWorkgroupSize(arg2 ?? 0, arg1);
  }
  return getWebGPUEngine().pipelineManager.selectWorkgroupSize(arg1);
}

export function setForcedWorkgroupSize(size: number | null): void {
  getWebGPUEngine().pipelineManager.setForcedWorkgroupSize(size);
}

export function recordWorkgroupTiming(
  archetypeId: string,
  workgroupSize: WorkgroupSize,
  durationMs: number,
): void {
  getWebGPUEngine().pipelineManager.recordWorkgroupTiming(archetypeId, workgroupSize, durationMs);
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
