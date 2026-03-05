export type {
  ArchetypeBatchDescriptor,
  ChannelMapping,
  GPUBatchDescriptor,
  GPUBatchWithPreprocessedKeyframes,
  GPUMetricsProvider,
  GPUResultPacket,
  InitConfig,
  PendingReadback,
  PhysicsBatchDescriptor,
  ProcessOutputBufferInput,
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
  WebGPUEngine,
  WebGPUFrameEncoder,
  WebGPUInitResult,
} from './types';

import { getWebGPUModule, getWebGPUModuleSync, preloadWebGPUModule } from './lazy-loader';

export { getWebGPUModule, getWebGPUModuleSync, preloadWebGPUModule };

function getRequiredExport<K extends keyof typeof import('@g-motion/webgpu/internal')>(
  key: K,
): (typeof import('@g-motion/webgpu/internal'))[K] {
  const mod = getWebGPUModuleSync();
  if (!mod) {
    throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  }
  return mod[key];
}

function getOptionalExport<K extends keyof typeof import('@g-motion/webgpu/internal')>(
  key: K,
): (typeof import('@g-motion/webgpu/internal'))[K] | undefined {
  const mod = getWebGPUModuleSync();
  return mod?.[key];
}

export const EASING_MODE = {
  LINEAR: 0,
  CUBIC_IN: 1,
  CUBIC_OUT: 2,
  CUBIC_IN_OUT: 3,
  BACK_IN: 4,
  BACK_OUT: 5,
  BACK_IN_OUT: 6,
  ELASTIC_IN: 7,
  ELASTIC_OUT: 8,
  ELASTIC_IN_OUT: 9,
  BOUNCE_IN: 10,
  BOUNCE_OUT: 11,
  BOUNCE_IN_OUT: 12,
} as const;

export const PHYSICS_STATE_STRIDE = 16;

export const getGPUResultQueueLength = () => getOptionalExport('getGPUResultQueueLength')?.() ?? 0;
export const getPendingReadbackCount = () => getOptionalExport('getPendingReadbackCount')?.() ?? 0;
export const setGPUResultWakeup = (wakeup?: () => void) => getOptionalExport('setGPUResultWakeup')?.(wakeup);
export const getPersistentGPUBufferManager = () => getRequiredExport('getPersistentGPUBufferManager')();
export const selectWorkgroupSize = (archetypeId: string, entityCount: number) =>
  getOptionalExport('selectWorkgroupSize')?.(archetypeId, entityCount) ?? 64;
export const initializeWebGPU = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['initializeWebGPU']>) =>
  getRequiredExport('initializeWebGPU')(...args);
export const clearPhysicsGPUEntities = () => getOptionalExport('clearPhysicsGPUEntities')?.();
export const createWebGPUFrameEncoder = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['createWebGPUFrameEncoder']>) =>
  getRequiredExport('createWebGPUFrameEncoder')(...args);
export const getWebGPUEngine = () => getRequiredExport('getWebGPUEngine')();
export const resetWebGPUEngine = () => getOptionalExport('resetWebGPUEngine')?.();
export const setPendingReadbackCount = (count: number) => getOptionalExport('setPendingReadbackCount')?.(count);
export const disableGPUOutputFormatPass = () => getOptionalExport('disableGPUOutputFormatPass')?.();
export const enableGPUOutputFormatPass = () => getOptionalExport('enableGPUOutputFormatPass')?.();
export const processOutputBuffer = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['processOutputBuffer']>) =>
  getRequiredExport('processOutputBuffer')(...args);
export const drainGPUResultsInto = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['drainGPUResultsInto']>) =>
  getOptionalExport('drainGPUResultsInto')?.(...args) ?? false;
export const getGPUChannelMappingRegistry = () => getRequiredExport('getGPUChannelMappingRegistry')();
export const isMatrix2DTransformChannels = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['isMatrix2DTransformChannels']>) =>
  getRequiredExport('isMatrix2DTransformChannels')(...args);
export const isMatrix3DTransformChannels = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['isMatrix3DTransformChannels']>) =>
  getRequiredExport('isMatrix3DTransformChannels')(...args);
export const isStandardTransformChannels = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['isStandardTransformChannels']>) =>
  getRequiredExport('isStandardTransformChannels')(...args);
export const unmarkPhysicsGPUEntity = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['unmarkPhysicsGPUEntity']>) =>
  getOptionalExport('unmarkPhysicsGPUEntity')?.(...args);
export const OUTPUT_FORMAT = {
  FLOAT: 0,
  COLOR_RGBA: 1,
  COLOR_NORM: 2,
  ANGLE_DEG: 3,
  ANGLE_RAD: 4,
  PERCENT: 5,
  MATRIX_2D: 6,
  MATRIX_3D: 7,
  PACKED_HALF2: 8,
} as const;
export const packedRGBAToCSS = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['packedRGBAToCSS']>) =>
  getRequiredExport('packedRGBAToCSS')(...args);
export const unpackHalf2 = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['unpackHalf2']>) =>
  getRequiredExport('unpackHalf2')(...args);
export const getOutputFormatBufferPoolStats = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['getOutputFormatBufferPoolStats']>) =>
  getOptionalExport('getOutputFormatBufferPoolStats')?.(...args) ?? null;
export const ensureWebGPUInitialized = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['ensureWebGPUInitialized']>) =>
  getRequiredExport('ensureWebGPUInitialized')(...args);
export const ensureWebGPUPipelines = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['ensureWebGPUPipelines']>) =>
  getRequiredExport('ensureWebGPUPipelines')(...args);
export const dispatchPhysicsBatch = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['dispatchPhysicsBatch']>) =>
  getRequiredExport('dispatchPhysicsBatch')(...args);
export const markPhysicsGPUEntity = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['markPhysicsGPUEntity']>) =>
  getOptionalExport('markPhysicsGPUEntity')?.(...args);
export const dispatchGPUBatch = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['dispatchGPUBatch']>) =>
  getRequiredExport('dispatchGPUBatch')(...args);
export const runKeyframeInterpPass = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['runKeyframeInterpPass']>) =>
  getRequiredExport('runKeyframeInterpPass')(...args);
export const runKeyframePreprocessPass = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['runKeyframePreprocessPass']>) =>
  getRequiredExport('runKeyframePreprocessPass')(...args);
export const runViewportCullingCompactionPass = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['runViewportCullingCompactionPass']>) =>
  getRequiredExport('runViewportCullingCompactionPass')(...args);
export const runViewportCullingCompactionPassAsync = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['runViewportCullingCompactionPassAsync']>) =>
  getRequiredExport('runViewportCullingCompactionPassAsync')(...args);
export const tryReleasePooledOutputBufferFromTag = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['tryReleasePooledOutputBufferFromTag']>) =>
  getOptionalExport('tryReleasePooledOutputBufferFromTag')?.(...args);
export const enqueueGPUResults = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['enqueueGPUResults']>) =>
  getOptionalExport('enqueueGPUResults')?.(...args);
export const packChannelMaps = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['packChannelMaps']>) =>
  getRequiredExport('packChannelMaps')(...args);
export const packRawKeyframes = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['packRawKeyframes']>) =>
  getRequiredExport('packRawKeyframes')(...args);
export const preprocessChannelsToRawAndMap = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['preprocessChannelsToRawAndMap']>) =>
  getRequiredExport('preprocessChannelsToRawAndMap')(...args);
export const consumeForcedGPUStateSyncEntityIdsSet = () =>
  getOptionalExport('consumeForcedGPUStateSyncEntityIdsSet')?.() ?? new Set<number>();
export const isPhysicsGPUEntity = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['isPhysicsGPUEntity']>) =>
  getOptionalExport('isPhysicsGPUEntity')?.(...args) ?? false;
export const setForcedWorkgroupSize = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['setForcedWorkgroupSize']>) =>
  getOptionalExport('setForcedWorkgroupSize')?.(...args);
export const cachePipeline = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['cachePipeline']>) =>
  getRequiredExport('cachePipeline')(...args);
export const clearPipelineCache = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['clearPipelineCache']>) =>
  getOptionalExport('clearPipelineCache')?.(...args);
export const getPipelineForWorkgroup = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['getPipelineForWorkgroup']>) =>
  getRequiredExport('getPipelineForWorkgroup')(...args);
export const initWebGPUCompute = (...args: Parameters<typeof import('@g-motion/webgpu/internal')['initWebGPUCompute']>) =>
  getRequiredExport('initWebGPUCompute')(...args);

export async function getWebGPUTestingModule(): Promise<typeof import('@g-motion/webgpu/testing') | null> {
  try {
    return await import('@g-motion/webgpu/testing');
  } catch {
    return null;
  }
}
