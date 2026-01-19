import { MotionPlugin } from '../plugin';
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
 */
export const WebGPUComputePlugin: MotionPlugin = {
  name: 'WebGPUComputePlugin',
  manifest: {
    systems: [BatchSamplingSystem, WebGPUComputeSystem],
  },
};
