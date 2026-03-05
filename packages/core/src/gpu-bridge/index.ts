export type { GPUModuleFacade } from './types';
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

export const getGPUModule = getWebGPUModule;
export const getGPUModuleSync = getWebGPUModuleSync;
export { preloadWebGPUModule };

export const EASING_MODE = { LINEAR: 0, CUBIC_IN: 1, CUBIC_OUT: 2, CUBIC_IN_OUT: 3, BACK_IN: 4, BACK_OUT: 5, BACK_IN_OUT: 6, ELASTIC_IN: 7, ELASTIC_OUT: 8, ELASTIC_IN_OUT: 9, BOUNCE_IN: 10, BOUNCE_OUT: 11, BOUNCE_IN_OUT: 12 } as const;
export const PHYSICS_STATE_STRIDE = 16;
export const OUTPUT_FORMAT = { FLOAT: 0, COLOR_RGBA: 1, COLOR_NORM: 2, ANGLE_DEG: 3, ANGLE_RAD: 4, PERCENT: 5, MATRIX_2D: 6, MATRIX_3D: 7, PACKED_HALF2: 8 } as const;

export async function getWebGPUTestingModule(): Promise<typeof import('@g-motion/webgpu/testing') | null> {
  try {
    return await import('@g-motion/webgpu/testing');
  } catch {
    return null;
  }
}
