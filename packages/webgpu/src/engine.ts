export { WebGPUEngine, getWebGPUEngine, resetWebGPUEngine } from './runtime/engine';
export { ensureWebGPUInitialized, ensureWebGPUPipelines, initializeWebGPU } from './runtime/init';

export type { WebGPUEngineConfig } from './runtime/engine';
export type { InitConfig, WebGPUInitializationDeps, WebGPUInitResult } from './runtime/init';
