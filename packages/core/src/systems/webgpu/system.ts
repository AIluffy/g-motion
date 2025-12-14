/**
 * WebGPU Compute System
 *
 * Main entry point for GPU-accelerated animation compute.
 * Orchestrates initialization, pipeline management, and per-archetype dispatch.
 */

import { SystemDef } from '../../plugin';
import { getWebGPUBufferManager, WebGPUBufferManager } from '../../webgpu/buffer';
import { buildInterpolationShader } from '../../webgpu/shader';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../webgpu/custom-easing';
import { getGPUMetricsProvider } from '../../webgpu/metrics-provider';
import { getAppContext } from '../../context';
import { getTimingHelper, TimingHelper } from '../../webgpu/timing-helper';
import { initWebGPUCompute } from './initialization';
import { cachePipeline } from './pipeline';
import { dispatchGPUBatch } from './dispatch';

// Sentinel value to track initialization
let bufferManager: WebGPUBufferManager | null = null;
let isInitialized = false;
let deviceAvailable = false;
let shaderVersion = -1;
let timingHelper: TimingHelper | null = null;

/**
 * WebGPU Compute System with Per-Archetype Dispatch
 *
 * Processes archetype-segmented batches through GPU compute shaders
 * with adaptive workgroup sizing and multiple dispatches.
 *
 * This system:
 * 1. Receives per-archetype batches from BatchSamplingSystem
 * 2. Uploads data to GPU buffers (shared or persistent)
 * 3. Dispatches compute shader once per archetype with tuned workgroup size
 * 4. Records dispatch metrics for monitoring
 */
export const WebGPUComputeSystem: SystemDef = {
  name: 'WebGPUComputeSystem',
  order: 6, // Run after BatchSamplingSystem (order 5)

  async update(_dt: number) {
    // Lazy initialization
    if (!isInitialized) {
      bufferManager = getWebGPUBufferManager();
      const initResult = await initWebGPUCompute(bufferManager);
      isInitialized = true;
      deviceAvailable = initResult.deviceAvailable;
      shaderVersion = initResult.shaderVersion;

      if (deviceAvailable && bufferManager) {
        timingHelper = getTimingHelper(bufferManager.getDevice());
        const pipeline = (bufferManager as any).computePipeline;
        if (pipeline) {
          cachePipeline(64, pipeline);
        }
      }
    }

    if (!isInitialized || !bufferManager || !deviceAvailable) {
      return;
    }

    const device = bufferManager.getDevice();
    if (!device) return;

    // Rebuild pipeline if custom easing set changed
    const currentVersion = getCustomEasingVersion();
    if (currentVersion !== shaderVersion) {
      const bindGroupLayoutEntries = [
        {
          binding: 0,
          visibility: 4, // GPUShaderStage.COMPUTE = 4
          buffer: { type: 'storage' as const }, // states
        },
        {
          binding: 1,
          visibility: 4, // GPUShaderStage.COMPUTE = 4
          buffer: { type: 'read-only-storage' as const }, // keyframes
        },
        {
          binding: 2,
          visibility: 4, // GPUShaderStage.COMPUTE = 4
          buffer: { type: 'storage' as const }, // outputs
        },
      ];

      const success = await bufferManager.initComputePipeline({
        shaderCode: buildInterpolationShader(getCustomGpuEasings()),
        bindGroupLayoutEntries,
      });
      if (success) {
        const pipeline = (bufferManager as any).computePipeline;
        if (pipeline) {
          cachePipeline(64, pipeline);
        }
        shaderVersion = currentVersion;
      }
    }

    // Adaptive threshold check with frame budget monitoring
    const metricsProvider = getGPUMetricsProvider();
    const status = metricsProvider.getStatus();

    // Calculate dynamic threshold based on frame performance
    const dynamicThreshold = metricsProvider.calculateDynamicThreshold(
      status.threshold,
      16, // 60fps target
    );

    // Check if GPU should be enabled based on dynamic threshold
    if (!status.enabled || status.activeEntityCount < dynamicThreshold) {
      // Update status with fallback flag if frame budget exceeded
      if (status.frameTimeMs && status.frameTimeMs > 12) {
        metricsProvider.updateStatus({ cpuFallbackActive: true });
      }
      return; // Below dynamic threshold or GPU disabled
    }

    // Clear fallback flag when GPU processing proceeds
    if (status.cpuFallbackActive) {
      metricsProvider.updateStatus({ cpuFallbackActive: false });
    }

    const context = getAppContext();
    const processor = context.getBatchProcessor();

    if (!processor) {
      return;
    }

    // Get all per-archetype batches prepared by BatchSamplingSystem
    const archetypeBatches = processor.getArchetypeBatches();
    if (archetypeBatches.size === 0) {
      return;
    }

    const queue = device.queue;

    // Dispatch once per archetype
    for (const [archetypeId, batch] of archetypeBatches) {
      await dispatchGPUBatch(device, queue, batch, timingHelper, archetypeId);
    }
  },
};
