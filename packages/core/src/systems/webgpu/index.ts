/**
 * WebGPU System Exports
 *
 * Unified export point for WebGPU compute components:
 * - WebGPUComputeSystem: Main GPU compute ECS system
 * - Pipeline management: Cache and retrieval functions
 * - Initialization: GPU setup and validation
 */

export { WebGPUComputeSystem } from './system';
export { initWebGPUCompute } from '../../webgpu/initialization';
export { getPipelineForWorkgroup, cachePipeline, clearPipelineCache } from '../../webgpu/pipeline';
export { dispatchGPUBatch, dispatchPhysicsBatch } from '../../webgpu/dispatch';
