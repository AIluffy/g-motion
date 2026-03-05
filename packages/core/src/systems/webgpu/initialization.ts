/**
 * WebGPU Compute Initialization
 *
 * Handles asynchronous GPU device creation, validation, and pipeline setup.
 */

import type { InitConfig, WebGPUEngine, WebGPUInitResult } from '../../gpu-bridge/types';
import { initializeWebGPU as initializeWebGPUCore } from '../../gpu-bridge';

export async function initializeWebGPU(
  engine: WebGPUEngine,
  config?: InitConfig,
): Promise<WebGPUInitResult> {
  // 底层初始化由 @g-motion/webgpu 负责
  return initializeWebGPUCore(engine, config);
}
