/**
 * WebGPU Compute Infrastructure
 *
 * This module provides the complete WebGPU compute pipeline for Motion animations,
 * including shader management, buffer pooling, batch processing, synchronization,
 * and performance monitoring.
 */

// Unified WebGPU Engine (consolidates buffer management, pipeline caching, runtime state)
export { getWebGPUEngine, resetWebGPUEngine, WebGPUEngine } from './engine';
export type { WebGPUEngineConfig } from './engine';

export { createWebGPUFrameEncoder } from './command-encoder';
export type { WebGPUFrameEncoder } from './command-encoder';

export { dispatchGPUBatch, dispatchPhysicsBatch } from './dispatch';

export {
  cachePipeline,
  clearPipelineCache,
  getPipelineForWorkgroup,
  precompileWorkgroupPipelines,
  selectWorkgroupSize,
} from './pipeline';
export type { WorkgroupSize } from './pipeline';

export {
  ensureWebGPUInitialized,
  ensureWebGPUPipelines,
  initWebGPUCompute,
} from './initialization';
export type { WebGPUInitializationDeps } from './initialization';

export {
  __getOutputFormatBufferPoolStatsForTests,
  __resetOutputFormatPassForTests,
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
  clearPhysicsGPUEntities,
  consumeForcedGPUStateSyncEntityIds,
  drainGPUResults,
  enqueueGPUResults,
  forceGPUStateSync,
  isPhysicsGPUEntity,
  markPhysicsGPUEntity,
  unmarkPhysicsGPUEntity,
} from './sync-manager';
export type { GPUResultPacket } from './sync-manager';

// Development tools (benchmark, profiler) are not exported for production use
// Import directly from './benchmark' in benchmark files if needed

// Main interpolation shader with Bezier support (Phase 1.1)
export {
  buildInterpolationShader,
  EASING_MODE,
  INTERPOLATION_SHADER,
  KEYFRAME_STRIDE,
  packKeyframeForGPU,
} from './shader';

// Transform matrix shaders (Phase 1.2)
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

// Culling shaders (Phase 1.3)
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

// Physics shaders (Phase 2.1)
// Individual physics shaders are registered by their respective plugins
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

// Output format shaders (Phase 2.2)
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
  unpackInterleavedOutputs,
} from './output-format-shader';
export type { InterleavedOutputData, OutputChannelDesc } from './output-format-shader';

// Keyframe preprocessing shaders (Phase 3.1)
export {
  CHANNEL_MAP_STRIDE,
  EASING_TYPE,
  easingStringToType,
  hashPropertyName,
  KEYFRAME_PREPROCESS_SHADER,
  KEYFRAME_SEARCH_SHADER,
  packChannelMaps,
  PACKED_KEYFRAME_STRIDE,
  packRawKeyframes,
  PROPERTY_HASHES,
  RAW_KEYFRAME_STRIDE,
} from './keyframe-preprocess-shader';
export type { ChannelMapData, RawKeyframeData } from './keyframe-preprocess-shader';

export { NonNegativeRollingAverage, TimingHelper } from './timing-helper';

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
  registerGPUChannelMappingForTracks,
  type GPUChannelMappingRegistrationMode,
} from './channel-mapping';
export type { BatchChannelTable, ChannelMapping } from './channel-mapping';
export * from './sync-manager';

export * from './channel-mapping';
export * from './keyframe-preprocess-shader';
export * from './metrics-provider';
export * from './output-buffer-processing';
export * from './output-format-shader';
export * from './passes/keyframe';
export * from './persistent-buffer-manager';
export * from './output-buffer-pool';
export * from './passes/viewport';
export * from './engine';
export * from './benchmark';
