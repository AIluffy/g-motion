/**
 * WebGPU Compute Initialization
 *
 * Handles asynchronous GPU device creation, validation, and pipeline setup.
 */

import type { InitConfig, WebGPUEngine, WebGPUInitResult } from '../bridge/types';
import { getGPUModuleSync } from '../bridge';

export async function initializeWebGPU(
  engine: WebGPUEngine,
  config?: InitConfig,
): Promise<WebGPUInitResult> {
  const gpu = getGPUModuleSync();
  if (!gpu) {
    throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  }
  return gpu.initializeWebGPU(engine, config);
}
