import type { AsyncReadbackManager } from '../../../webgpu/async-readback';
import type { WebGPUBufferManager } from '../../../webgpu/buffer';
import type { StagingBufferPool } from '../../../webgpu/staging-pool';
import type { TimingHelper } from '../../../webgpu/timing-helper';

export type WebGPUComputeRuntime = {
  bufferManager: WebGPUBufferManager | null;
  isInitialized: boolean;
  deviceAvailable: boolean;
  mockWebGPU: boolean;
  shaderVersion: number;
  physicsPipelinesReady: boolean;
  timingHelper: TimingHelper | null;
  stagingPool: StagingBufferPool | null;
  readbackManager: AsyncReadbackManager | null;
  webgpuFrameId: number;
  outputFormatStatsCounter: number;
  latestAsyncCullingFrameByArchetype: Map<string, number>;
  physicsParams: Float32Array;
};

export function createWebGPUComputeRuntime(): WebGPUComputeRuntime {
  return {
    bufferManager: null,
    isInitialized: false,
    deviceAvailable: false,
    mockWebGPU: false,
    shaderVersion: -1,
    physicsPipelinesReady: false,
    timingHelper: null,
    stagingPool: null,
    readbackManager: null,
    webgpuFrameId: 0,
    outputFormatStatsCounter: 0,
    latestAsyncCullingFrameByArchetype: new Map(),
    physicsParams: new Float32Array(4),
  };
}
