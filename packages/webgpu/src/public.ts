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
export { processOutputBuffer } from './output-format/output-buffer-processing';
export type {
  OutputBufferLeaseManager,
  ProcessOutputBufferInput,
} from './output-format/output-buffer-processing';
export { acquirePooledOutputBuffer, releasePooledOutputBuffer } from './gpu/output-buffer-pool';
export type { OutputBufferReadbackTag } from './gpu/output-buffer-pool';
export {
  buildInterpolationShader,
  EASING_MODE,
  INTERPOLATION_SHADER,
  KEYFRAME_STRIDE,
  packKeyframeForGPU,
} from './shaders/interpolation-shader';
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
} from './shaders/transform-shader';
export type { Transform2DData, Transform3DData } from './shaders/transform-shader';
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
} from './shaders/culling-shader';
export type { CullResultData, RenderStateData, RenderStateExData } from './shaders/culling-shader';
export {
  INERTIA_STATE_STRIDE,
  packInertiaStates,
  packSimParams,
  packSpringStates,
  PHYSICS_COMBINED_SHADER,
  PHYSICS_STATE_STRIDE,
  SPRING_STATE_STRIDE,
  unpackSpringStates,
} from './shaders/physics-shader';
export type { InertiaStateData, PhysicsSimParams, SpringStateData } from './shaders/physics-shader';
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
} from './shaders/output-format-shader';
export type { InterleavedOutputData, OutputChannelDesc } from './shaders/output-format-shader';
export { NonNegativeRollingAverage, TimingHelper } from './gpu/timing';
export { StagingBufferPool } from './gpu/staging-pool';
export type { StagingBufferEntry } from './gpu/staging-pool';
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


export { WebGPUConstants } from './constants/webgpu';
export { crc32 } from './stream/crc32';
export { encodePackedFrame, PackedStreamDecoder } from './stream/packed-stream';
export type { PackedFrame, PackedFrameHeader } from './stream/packed-stream';
export type {
  PreprocessedKeyframes,
  BatchDescriptor,
  LeasedBatchDescriptor,
  WorkgroupBatchDescriptor,
  KeyframePreprocessBatchDescriptor,
  ViewportCullingBatchDescriptor,
} from './runtime/batch-types';
