/**
 * WebGPU Compute Infrastructure
 *
 * This module provides the complete WebGPU compute pipeline for Motion animations,
 * including shader management, buffer pooling, batch processing, synchronization,
 * and performance monitoring.
 */

export { WebGPUBufferManager, getWebGPUBufferManager } from './buffer';
export type { ComputeMetrics, BufferAllocation } from './buffer';

export {
  ComputeShaderManager,
  type IComputeShader,
  type ComputeShaderConfig,
} from './shader-interface';

export {
  SyncManager,
  DataTransferOptimizer,
  ComputeOrchestrator,
  enqueueGPUResults,
  drainGPUResults,
  isPhysicsGPUEntity,
  markPhysicsGPUEntity,
  unmarkPhysicsGPUEntity,
  clearPhysicsGPUEntities,
  forceGPUStateSync,
  consumeForcedGPUStateSyncEntityIds,
} from './sync-manager';
export type { SyncEvent, PerformanceMetrics, GPUResultPacket } from './sync-manager';

// Development tools (benchmark, profiler) are not exported for production use
// Import directly from './benchmark' in benchmark files if needed

// Main interpolation shader with Bezier support (Phase 1.1)
export {
  INTERPOLATION_SHADER,
  buildInterpolationShader,
  EASING_MODE,
  KEYFRAME_STRIDE,
  packKeyframeForGPU,
} from './shader';

// Transform matrix shaders (Phase 1.2)
export {
  TRANSFORM_2D_SHADER,
  TRANSFORM_3D_SHADER,
  TRANSFORM_COMBINED_SHADER,
  TRANSFORM_2D_STRIDE,
  TRANSFORM_3D_STRIDE,
  MATRIX_3X3_STRIDE,
  MATRIX_4X4_STRIDE,
  packTransform2D,
  packTransform3D,
  unpackMatrix3x3,
  unpackMatrix4x4,
} from './transform-shader';
export type { Transform2DData, Transform3DData } from './transform-shader';

// Culling shaders (Phase 1.3)
export {
  CULLING_SHADER,
  ADVANCED_CULLING_SHADER,
  ADVANCED_CULLING_OUTPUT_COMPACT_SHADER,
  COMPACTION_SHADER,
  RENDER_STATE_STRIDE,
  CULL_RESULT_STRIDE,
  FRUSTUM_PLANES_FLOATS,
  packRenderStates,
  unpackCullResults,
  getVisibleEntityIds,
  groupByRenderer,
} from './culling-shader';
export type { RenderStateData, RenderStateExData, CullResultData } from './culling-shader';

// Physics shaders (Phase 2.1)
// Individual physics shaders are registered by their respective plugins
export {
  PHYSICS_COMBINED_SHADER,
  SPRING_STATE_STRIDE,
  INERTIA_STATE_STRIDE,
  PHYSICS_STATE_STRIDE,
  packSpringStates,
  packInertiaStates,
  packSimParams,
  unpackSpringStates,
} from './physics-shader';
export type { SpringStateData, InertiaStateData, PhysicsSimParams } from './physics-shader';

// Output format shaders (Phase 2.2)
export {
  OUTPUT_FORMAT_SHADER,
  BATCH_OUTPUT_SHADER,
  SOA_OUTPUT_SHADER,
  OUTPUT_FORMAT,
  OUTPUT_CHANNEL_STRIDE,
  INTERLEAVED_OUTPUT_STRIDE,
  packOutputChannels,
  unpackInterleavedOutputs,
  packedRGBAToCSS,
  createStandardChannelMapping,
} from './output-format-shader';
export type { OutputChannelDesc, InterleavedOutputData } from './output-format-shader';

// Keyframe preprocessing shaders (Phase 3.1)
export {
  KEYFRAME_PREPROCESS_SHADER,
  KEYFRAME_SEARCH_SHADER,
  EASING_TYPE,
  RAW_KEYFRAME_STRIDE,
  PACKED_KEYFRAME_STRIDE,
  CHANNEL_MAP_STRIDE,
  packRawKeyframes,
  packChannelMaps,
  hashPropertyName,
  PROPERTY_HASHES,
  easingStringToType,
} from './keyframe-preprocess-shader';
export type { RawKeyframeData, ChannelMapData } from './keyframe-preprocess-shader';

export { TimingHelper, NonNegativeRollingAverage } from './timing-helper';

export { StagingBufferPool } from './staging-pool';
export type { StagingBufferEntry } from './staging-pool';

export { AsyncReadbackManager } from './async-readback';
export type { PendingReadback } from './async-readback';

export {
  GPUChannelMappingRegistry,
  type GPUChannelMappingRegistrationMode,
  getGPUChannelMappingRegistry,
  createChannelMapping,
  createBatchChannelTable,
  createPackedRGBAChannelTable,
  createMatrix2DTransformChannelTable,
  createMatrix3DTransformChannelTable,
  isMatrix2DTransformChannels,
  isMatrix3DTransformChannels,
  registerGPUChannelMappingForTracks,
} from './channel-mapping';
export type { ChannelMapping, BatchChannelTable } from './channel-mapping';

// Shader registry utilities for plugin shader auto-registration
export { getRegisteredShaders, getRegisteredShader, clearShaderRegistry } from './shader-interface';

// Re-export batch processor for convenience
export { ComputeBatchProcessor } from '../systems/batch';
export type {
  BatchEntity,
  BatchKeyframe,
  BatchResult,
  BatchMetadata,
  GPUBatchConfig,
} from '../systems/batch';
