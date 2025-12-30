/**
 * WebGPU Compute System
 *
 * Main entry point for GPU-accelerated animation compute.
 * Orchestrates initialization, pipeline management, and per-archetype dispatch.
 *
 * GPU-First Architecture:
 * - All animations attempt GPU compute by default
 * - Automatic CPU fallback when WebGPU is unavailable
 * - config.gpuCompute='never' explicitly disables GPU path
 *
 * Performance optimizations:
 * - Persistent GPU buffers (avoid per-frame allocation)
 * - Incremental updates (upload only changed data)
 * - Async readback with timeout management
 * - Buffer pooling and reuse
 */

import type { SystemContext, SystemDef } from '../../plugin';
import { AsyncReadbackManager } from '../../webgpu/async-readback';
import { getWebGPUBufferManager, WebGPUBufferManager } from '../../webgpu/buffer';
import { getGPUChannelMappingRegistry } from '../../webgpu/channel-mapping';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../webgpu/custom-easing';
import {
  getPersistentGPUBufferManager,
  resetPersistentGPUBufferManager,
} from '../../webgpu/persistent-buffer-manager';
import { buildInterpolationShader } from '../../webgpu/shader';
import { StagingBufferPool } from '../../webgpu/staging-pool';
import { enqueueGPUResults, setPendingReadbackCount } from '../../webgpu/sync-manager';
import { getTimingHelper, TimingHelper } from '../../webgpu/timing-helper';
import { dispatchGPUBatch } from './dispatch';
import { initWebGPUCompute } from './initialization';
import { cachePipeline } from './pipeline';

// Sentinel value to track initialization
let bufferManager: WebGPUBufferManager | null = null;
let isInitialized = false;
let deviceAvailable = false;
let shaderVersion = -1;
let timingHelper: TimingHelper | null = null;
let stagingPool: StagingBufferPool | null = null;
let readbackManager: AsyncReadbackManager | null = null;

// Track if we've logged the fallback message
let cpuFallbackLogged = false;

export function __resetWebGPUComputeSystemForTests(): void {
  bufferManager = null;
  isInitialized = false;
  deviceAvailable = false;
  shaderVersion = -1;
  timingHelper = null;
  stagingPool = null;
  readbackManager = null;
  cpuFallbackLogged = false;
  resetPersistentGPUBufferManager();
  setPendingReadbackCount(0);
}

/**
 * WebGPU Compute System with Per-Archetype Dispatch
 *
 * GPU-First Architecture:
 * - Attempts GPU compute for all animations by default
 * - Falls back to CPU (InterpolationSystem) when GPU unavailable
 * - No threshold checks - GPU is always preferred when available
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

  async update(_dt: number, ctx?: SystemContext) {
    const metricsProvider = ctx?.services.metrics;
    const processor = ctx?.services.batchProcessor;
    const config = ctx?.services.config as any;

    if (!metricsProvider || !processor || !config) {
      return;
    }

    // Explicit GPU disable check
    const gpuMode = config.gpuCompute ?? 'auto';
    if (gpuMode === 'never') {
      // CPU fallback is handled by InterpolationSystem
      metricsProvider.updateStatus({ cpuFallbackActive: true, enabled: false });
      setPendingReadbackCount(0);
      return;
    }

    // Lazy initialization
    if (!isInitialized) {
      bufferManager = getWebGPUBufferManager();
      const initResult = await initWebGPUCompute(bufferManager);
      isInitialized = true;
      deviceAvailable = initResult.deviceAvailable;
      shaderVersion = initResult.shaderVersion;

      if (deviceAvailable && bufferManager) {
        const device = bufferManager.getDevice();
        timingHelper = getTimingHelper(device);
        const pipeline = (bufferManager as any).computePipeline;
        if (pipeline) {
          cachePipeline(64, pipeline);
        }
        stagingPool = new StagingBufferPool(device);
        readbackManager = new AsyncReadbackManager();
        // Initialize persistent buffer manager
        getPersistentGPUBufferManager(device);

        // Update metrics to indicate GPU is available and enabled
        metricsProvider.updateStatus({
          webgpuAvailable: true,
          gpuInitialized: true,
          enabled: true,
          cpuFallbackActive: false,
        });
      } else {
        // GPU not available - CPU fallback will be used
        if (!cpuFallbackLogged) {
          console.info('[Motion] WebGPU not available, using CPU fallback for animations');
          cpuFallbackLogged = true;
        }
        metricsProvider.updateStatus({
          webgpuAvailable: false,
          gpuInitialized: false,
          enabled: false,
          cpuFallbackActive: true,
        });
      }
    }

    // GPU not available - InterpolationSystem handles CPU fallback
    if (!bufferManager || !deviceAvailable) {
      setPendingReadbackCount(0);
      return;
    }

    const device = bufferManager.getDevice();

    if (!device) {
      metricsProvider.updateStatus({ cpuFallbackActive: true });
      setPendingReadbackCount(0);
      return;
    }

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

    // Process completed readbacks
    if (readbackManager) {
      const rb = readbackManager;
      // Limit readback processing to 2ms per frame to prevent blocking
      rb.drainCompleted(2).then((results) => {
        for (const res of results) {
          const values = res.values;
          if (values && values.length) {
            enqueueGPUResults({
              archetypeId: res.archetypeId,
              entityIds: res.entityIds,
              values,
              stride: res.stride,
              channels: res.channels,
            });
          }

          try {
            metricsProvider.recordMetric({
              batchId: `${res.archetypeId}-sync`,
              entityCount: res.entityIds.length,
              timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
              gpu: true,
              syncPerformed: true,
              syncDurationMs: res.syncDurationMs ?? 0,
              syncDataSize: res.byteSize,
            });
          } catch {
            // ignore
          }

          stagingPool!.markAvailable(res.stagingBuffer);

          if (typeof res.leaseId === 'number') {
            processor.releaseEntityIds(res.leaseId);
          }
        }
        setPendingReadbackCount(rb.getPendingCount());
      });
      setPendingReadbackCount(rb.getPendingCount());
    }

    // GPU-First: Always process batches when GPU is available
    // No threshold checks - GPU is preferred for all animations
    metricsProvider.updateStatus({ enabled: true, cpuFallbackActive: false });

    // Get all per-archetype batches prepared by BatchSamplingSystem
    const archetypeBatches = processor.getArchetypeBatches();
    if (archetypeBatches.size === 0 || !stagingPool) {
      return;
    }

    const queue = device.queue;
    const channelRegistry = getGPUChannelMappingRegistry();

    for (const [archetypeId, batch] of archetypeBatches) {
      const leaseId = (batch as any).entityIdsLeaseId as number | undefined;
      const table = channelRegistry.getChannels(archetypeId);
      const channels = table?.channels ?? [];
      const channelCount = channels.length || 1;

      try {
        const { outputBuffer, entityCount } = await dispatchGPUBatch(
          device,
          queue,
          batch,
          timingHelper,
          archetypeId,
          channelCount,
        );

        const bufferSize = (outputBuffer as any).size as number | undefined;
        const expectedSize = entityCount * channelCount * 4;
        const byteSize = Math.min(bufferSize ?? expectedSize, expectedSize);

        const stride = channelCount;
        const stagingBuffer = stagingPool.acquire(archetypeId, byteSize);
        if (!stagingBuffer) {
          outputBuffer.destroy();
          if (typeof leaseId === 'number') {
            processor.releaseEntityIds(leaseId);
          }
          continue;
        }
        if (typeof leaseId === 'number') {
          processor.markEntityIdsInFlight(leaseId);
        }
        stagingPool.markInFlight(stagingBuffer);

        const copyEncoder = device.createCommandEncoder({
          label: `copy-output-${archetypeId}`,
        });
        copyEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, byteSize);
        queue.submit([copyEncoder.finish()]);
        outputBuffer.destroy();

        if (readbackManager) {
          const mapPromise = stagingBuffer.mapAsync((GPUMapMode as any).READ);
          readbackManager.enqueueMapAsync(
            archetypeId,
            batch.entityIds,
            stagingBuffer,
            mapPromise,
            byteSize,
            200, // 200ms timeout
            stride,
            channels.length ? channels : undefined,
            leaseId,
          );
          setPendingReadbackCount(readbackManager.getPendingCount());
        }
      } catch {
        if (typeof leaseId === 'number') {
          processor.releaseEntityIds(leaseId);
        }
        console.warn('[Motion][WebGPUComputeSystem] dispatchGPUBatch failed', {
          archetypeId,
          entityCount: batch.entityCount,
          channelCount,
        });
      }
    }

    stagingPool.nextFrame();

    // Advance persistent buffer manager frame (for cleanup)
    try {
      const persistentBufferManager = getPersistentGPUBufferManager();
      persistentBufferManager.nextFrame();
    } catch {
      // Not initialized yet, ignore
    }
  },
};
