export { getWebGPUEngine, resetWebGPUEngine, WebGPUEngine } from './runtime/engine';
export type { WebGPUEngineConfig } from './runtime/engine';
export {
  createGPUContext,
  destroyGPUContext,
  getDefaultGPUContext,
  setDefaultGPUContext,
} from './runtime/context';
export type { GPUContext, GPUContextConfig } from './runtime/context';
export { createWebGPUFrameEncoder } from './runtime/encoder';
export type { WebGPUFrameEncoder } from './runtime/encoder';
export { dispatchGPUBatch, dispatchPhysicsBatch } from './runtime/dispatch';
export { ensureWebGPUInitialized, ensureWebGPUPipelines, initializeWebGPU } from './runtime/init';
export type { InitConfig, WebGPUInitializationDeps, WebGPUInitResult } from './runtime/init';
export {
  disableGPUOutputFormatPass,
  enableGPUOutputFormatPass,
  getOutputFormatBufferPoolStats,
  releaseOutputFormatBuffer,
  runOutputFormatPass,
} from './output-format';
export type { OutputFormatPoolStats } from './output-format';
export { processOutputBuffer } from './output-buffer-processing';
export type {
  OutputBufferLeaseManager,
  ProcessOutputBufferInput,
} from './output-buffer-processing';
export { acquirePooledOutputBuffer, releasePooledOutputBuffer } from './output-buffer-pool';
export type { OutputBufferReadbackTag } from './output-buffer-pool';
export {
  buildInterpolationShader,
  EASING_MODE,
  INTERPOLATION_SHADER,
  KEYFRAME_STRIDE,
  packKeyframeForGPU,
} from './shader';
export {
  MATRIX_3X3_STRIDE,
  MATRIX_4X4_STRIDE,
  packTransform2D,
  packTransform3D,
  TRANSFORM_2D_SHADER,
  TRANSFORM_2D_STRIDE,
  TRANSFORM_3D_SHADER,
  TRANSFORM_3D_STRIDE,
  TRANSFORM_COMBINED_SHADER,
  unpackMatrix3x3,
  unpackMatrix4x4,
} from './transform-shader';
export type { Transform2DData, Transform3DData } from './transform-shader';
export {
  ADVANCED_CULLING_OUTPUT_COMPACT_SHADER,
  ADVANCED_CULLING_SHADER,
  COMPACTION_SHADER,
  CULL_RESULT_STRIDE,
  CULLING_SHADER,
  FRUSTUM_PLANES_FLOATS,
  getVisibleEntityIds,
  groupByRenderer,
  packRenderStates,
  RENDER_STATE_STRIDE,
  unpackCullResults,
} from './culling-shader';
export type { CullResultData, RenderStateData, RenderStateExData } from './culling-shader';
export {
  INERTIA_STATE_STRIDE,
  packInertiaStates,
  packSimParams,
  packSpringStates,
  PHYSICS_COMBINED_SHADER,
  PHYSICS_STATE_STRIDE,
  SPRING_STATE_STRIDE,
  unpackSpringStates,
} from './physics-shader';
export type { InertiaStateData, PhysicsSimParams, SpringStateData } from './physics-shader';
export {
  BATCH_OUTPUT_SHADER,
  createStandardChannelMapping,
  INTERLEAVED_OUTPUT_STRIDE,
  OUTPUT_CHANNEL_STRIDE,
  OUTPUT_FORMAT,
  OUTPUT_FORMAT_SHADER,
  packedRGBAToCSS,
  packOutputChannels,
  SOA_OUTPUT_SHADER,
  unpackHalf2,
  unpackInterleavedOutputs,
} from './output-format-shader';
export type { InterleavedOutputData, OutputChannelDesc } from './output-format-shader';
export { NonNegativeRollingAverage, TimingHelper } from './gpu/timing';
export { StagingBufferPool } from './staging-pool';
export type { StagingBufferEntry } from './staging-pool';
export { AsyncReadbackManager } from './async-readback';
export type { PendingReadback } from './async-readback';
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
