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

export { initWebGPUCompute, ensureWebGPUPipelines } from './runtime/init';
export type { WebGPUInitializationDeps } from './runtime/init';

export { createWebGPUFrameEncoder } from './runtime/encoder';
export type { WebGPUFrameEncoder } from './runtime/encoder';

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

export {
  disableGPUOutputFormatPass,
  enableGPUOutputFormatPass,
  getOutputFormatBufferPoolStats,
  releaseOutputFormatBuffer,
  runOutputFormatPass,
} from './output-format';
export type { OutputFormatPoolStats } from './output-format';
export { processOutputBuffer } from './output-format/output-buffer-processing';
export type {
  OutputBufferLeaseManager,
  ProcessOutputBufferInput,
} from './output-format/output-buffer-processing';

export {
  acquirePooledOutputBuffer,
  releasePooledOutputBuffer,
  tryReleasePooledOutputBufferFromTag,
} from './gpu/output-buffer-pool';
export type { OutputBufferReadbackTag } from './gpu/output-buffer-pool';

export {
  runKeyframeInterpPass,
  runKeyframePreprocessPass,
} from './passes/keyframe';
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

export * from './shaders';

export { AsyncReadbackManager } from './runtime/async-readback';
export type { PendingReadback } from './runtime/async-readback';

export {
  createBatchChannelTable,
  createChannelMapping,
  createMatrix2DTransformChannelTable,
  createMatrix3DTransformChannelTable,
  createPackedRGBAChannelTable,
  getGPUChannelMappingRegistry,
  GPUChannelMappingRegistry,
  isMatrix2DTransformChannels,
  isMatrix3DTransformChannels,
  isStandardTransformChannels,
  registerGPUChannelMappingForTracks,
} from './runtime/channels';
export type {
  GPUChannelMappingRegistrationMode,
  BatchChannelTable,
  ChannelMapping,
} from './runtime/channels';

export type {
  GPUBatchBuffers,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
  ArchetypeBatchDescriptor,
  KeyframePreprocessBatchDescriptor,
  GPUBatchWithPreprocessedKeyframes,
  ViewportCullingBatchDescriptor,
  GPUBatchContextWithArchetypes,
  DeviceInitResult,
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
} from './runtime/types';

export {
  createGPUMetricsProvider,
  getGPUMetricsProvider,
  setDefaultGPUMetricsProvider,
  setGPUMetricsProvider,
} from './runtime/metrics';
export type {
  GPUBatchStatus,
  GPUBatchMetric,
  GPUArchetypeTiming,
  SystemTimingStat,
  GPUMemoryStats,
  GPUMetricsProvider,
} from './runtime/metrics';

export * from './gpu/persistent-buffer-manager';
export type { MetricsCollector } from './types/metrics-collector';
export { noopMetricsCollector } from './types/metrics-collector';
