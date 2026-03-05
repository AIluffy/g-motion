export * from './public';
export {
  cachePipeline,
  clearPipelineCache,
  getPipelineForWorkgroup,
  precompileWorkgroupPipelines,
  recordWorkgroupTiming,
  selectWorkgroupSize,
  setForcedWorkgroupSize,
} from './gpu/workgroup';
export type { WorkgroupSize } from './gpu/workgroup';
export { initWebGPUCompute } from './runtime/init';
export {
  createGPUContext,
  createTestGPUContext,
  destroyGPUContext,
  getDefaultGPUContext,
  resetGPUContext,
  setDefaultGPUContext,
} from './runtime/context';
export type { GPUContext, GPUContextConfig } from './runtime/context';
export {
  clearPhysicsGPUEntities,
  consumeForcedGPUStateSyncEntityIds,
  consumeForcedGPUStateSyncEntityIdsSet,
  drainGPUResults,
  drainGPUResultsInto,
  enqueueGPUResults,
  forceGPUStateSync,
  getGPUResultQueueLength,
  getPendingReadbackCount,
  isPhysicsGPUEntity,
  markPhysicsGPUEntity,
  setGPUResultWakeup,
  setPendingReadbackCount,
  unmarkPhysicsGPUEntity,
} from './runtime/sync';
export type { GPUResultPacket, GPUSyncManager } from './runtime/sync';
export { tryReleasePooledOutputBufferFromTag } from './gpu/output-buffer-pool';
export { runKeyframeInterpPass, runKeyframePreprocessPass } from './passes/keyframe';
export type { KeyframePreprocessResult, KeyframeSearchResultGPU } from './passes/keyframe';
export {
  runViewportCullingCompactionPass,
  runViewportCullingCompactionPassAsync,
} from './passes/viewport';
export type { Scratch } from './passes/viewport';
export {
  collectViewportCullingCPUInputs,
  ENTITY_BOUNDS_STRIDE,
  FRUSTUM_PLANES_FLOATS,
  RENDER_STATE_EX_STRIDE,
} from './passes/viewport/culling-types';
export * from './shaders/keyframe-preprocess-shader';
export * from './gpu/persistent-buffer-manager';
export * from './benchmark';
