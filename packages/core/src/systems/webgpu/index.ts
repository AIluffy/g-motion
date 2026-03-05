/**
 * WebGPU System Exports
 */

import { getGPUModuleSync } from '../../gpu-bridge';

export const cachePipeline = (...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['cachePipeline']>) => {
  const gpu = getGPUModuleSync();
  if (!gpu) throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  return gpu.cachePipeline(...args);
};

export const clearPipelineCache = (...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['clearPipelineCache']>) =>
  getGPUModuleSync()?.clearPipelineCache?.(...args);

export const dispatchGPUBatch = (...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['dispatchGPUBatch']>) => {
  const gpu = getGPUModuleSync();
  if (!gpu) throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  return gpu.dispatchGPUBatch(...args);
};

export const dispatchPhysicsBatch = (...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['dispatchPhysicsBatch']>) => {
  const gpu = getGPUModuleSync();
  if (!gpu) throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  return gpu.dispatchPhysicsBatch(...args);
};

export const getPipelineForWorkgroup = (...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['getPipelineForWorkgroup']>) => {
  const gpu = getGPUModuleSync();
  if (!gpu) throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  return gpu.getPipelineForWorkgroup(...args);
};

export const initWebGPUCompute = (...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['initWebGPUCompute']>) => {
  const gpu = getGPUModuleSync();
  if (!gpu) throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  return gpu.initWebGPUCompute(...args);
};

export const enqueueGPUResults = (...args: Parameters<NonNullable<ReturnType<typeof getGPUModuleSync>>['enqueueGPUResults']>) =>
  getGPUModuleSync()?.enqueueGPUResults?.(...args);

export { WebGPUComputeSystem } from './system';
