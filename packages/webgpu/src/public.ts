// Engine lifecycle
export { WebGPUEngine, getWebGPUEngine, resetWebGPUEngine } from './runtime/engine';
export type { WebGPUEngineConfig } from './runtime/engine';
export { ensureWebGPUInitialized, initializeWebGPU } from './runtime/init';
export type { InitConfig, WebGPUInitResult } from './runtime/init';

// Context
export { createGPUContext, destroyGPUContext, getDefaultGPUContext } from './runtime/context';
export type { GPUContext } from './runtime/context';

// Dispatch
export { dispatchGPUBatch, dispatchPhysicsBatch } from './runtime/dispatch';

// Metrics
export { createGPUMetricsProvider, getGPUMetricsProvider } from './runtime/metrics';
export type { GPUBatchMetric, GPUBatchStatus, GPUMetricsProvider, SystemTimingStat } from './runtime/metrics';

// Channel mapping
export { createChannelMapping, registerGPUChannelMappingForTracks } from './runtime/channels';

// Common constants
export { WebGPUConstants } from './constants/webgpu';

// Common public types
export type { GPUBatchDescriptor, PhysicsBatchDescriptor } from './runtime/types';
