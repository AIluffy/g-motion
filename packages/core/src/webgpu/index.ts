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

export { SyncManager, DataTransferOptimizer, ComputeOrchestrator } from './sync-manager';
export type { SyncEvent, PerformanceMetrics } from './sync-manager';

export { ComputeBenchmark, PerformanceProfiler, RegressionTestHarness } from './benchmark';
export type { BenchmarkResult } from './benchmark';

export { INTERPOLATION_SHADER } from './shader';

export { TimingHelper, NonNegativeRollingAverage } from './timing-helper';

export { StagingBufferPool } from './staging-pool';
export type { StagingBufferEntry } from './staging-pool';

export { AsyncReadbackManager } from './async-readback';
export type { PendingReadback } from './async-readback';

export {
  GPUChannelMappingRegistry,
  getGPUChannelMappingRegistry,
  createChannelMapping,
  createBatchChannelTable,
} from './channel-mapping';
export type { ChannelMapping, BatchChannelTable } from './channel-mapping';

// Re-export batch processor for convenience
export { ComputeBatchProcessor } from '../systems/batch';
export type {
  BatchEntity,
  BatchKeyframe,
  BatchResult,
  BatchMetadata,
  GPUBatchConfig,
} from '../systems/batch';
