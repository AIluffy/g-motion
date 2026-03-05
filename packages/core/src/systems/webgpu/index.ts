/**
 * WebGPU System Exports
 *
 * Unified export point for WebGPU compute components:
 * - WebGPUComputeSystem: Main GPU compute ECS system
 * - Pipeline management: Cache and retrieval functions
 * - Initialization: GPU setup and validation
 */

export {
  cachePipeline,
  clearPipelineCache,
  dispatchGPUBatch,
  dispatchPhysicsBatch,
  getPipelineForWorkgroup,
  initWebGPUCompute,
} from '../../gpu-bridge';
export { enqueueGPUResults } from '../../gpu-bridge';
export { WebGPUComputeSystem } from './system';
