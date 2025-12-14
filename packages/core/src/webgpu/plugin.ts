import { MotionPlugin, MotionApp } from '../plugin';
import { WebGPUComputeSystem } from '../systems/webgpu';
import { BatchSamplingSystem } from '../systems/batch';

/**
 * WebGPU Compute Plugin
 *
 * Integrates GPU-accelerated compute shaders into the Motion animation engine.
 * This plugin enables high-performance interpolation calculations through WebGPU's
 * compute pipeline, integrated with the batch processing system.
 *
 * Features:
 * - Built-in WGSL compute shader for interpolation calculations
 * - Automatic GPU buffer management and pipeline initialization
 * - Seamless integration with batch sampling system
 * - Graceful fallback when WebGPU is unavailable
 */
export const WebGPUComputePlugin: MotionPlugin = {
  name: 'WebGPUComputePlugin',
  setup(app: MotionApp) {
    // Register batch sampling system (runs first, order 5)
    app.registerSystem(BatchSamplingSystem);

    // Register WebGPU compute system (runs after batch, order 6)
    app.registerSystem(WebGPUComputeSystem);
  },
};
