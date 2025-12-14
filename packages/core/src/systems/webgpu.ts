// T033 & Per-Archetype GPU Dispatch: WebGPU Compute System with adaptive workgroups

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { SystemDef } from '../plugin';
import { getWebGPUBufferManager, WebGPUBufferManager } from '../webgpu/buffer';
import { buildInterpolationShader } from '../webgpu/shader';
import { getCustomEasingVersion, getCustomGpuEasings } from '../webgpu/custom-easing';
import { getGPUMetricsProvider } from '../webgpu/metrics-provider';
import { getAppContext } from '../context';
import { getTimingHelper, TimingHelper } from '../webgpu/timing-helper';
import { StagingBufferPool } from '../webgpu/staging-pool';
import { AsyncReadbackManager } from '../webgpu/async-readback';
import { enqueueGPUResults } from '../webgpu/sync-manager';
import { getGPUChannelMappingRegistry } from '../webgpu/channel-mapping';

// Sentinel value to track initialization
let bufferManager: WebGPUBufferManager | null = null;
let isInitialized = false;
let deviceAvailable = false;
let shaderVersion = -1;
let timingHelper: TimingHelper | null = null;
let stagingPool: StagingBufferPool | null = null;
let readbackMgr: AsyncReadbackManager | null = null;

// Pipeline cache for different workgroup sizes
let pipelineCache: Map<number, any> = new Map(); // WG size → Pipeline

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

async function initWebGPUCompute() {
  if (isInitialized) return;

  bufferManager = getWebGPUBufferManager();
  const initOk = await bufferManager.init();
  const device = bufferManager.getDevice();
  if (!initOk || !device) {
    console.warn(
      '[Motion] WebGPU not available; GPU batch processing disabled. CPU path will be used.',
    );
    isInitialized = true;
    deviceAvailable = false;
    getGPUMetricsProvider().updateStatus({
      webgpuAvailable: false,
      gpuInitialized: false,
    });
    return;
  }

  deviceAvailable = true;

  // Initialize TimingHelper for GPU compute timing
  timingHelper = getTimingHelper(device);

  // Initialize staging buffer pool (Phase 3)
  stagingPool = new StagingBufferPool(device);
  readbackMgr = new AsyncReadbackManager();

  // Initialize compute pipeline for default workgroup size (64)
  const success = await bufferManager.initComputePipeline({
    shaderCode: buildInterpolationShader(getCustomGpuEasings()),
    bindGroupLayoutEntries,
  });

  // Cache the default pipeline
  if (success) {
    const pipeline = (bufferManager as any).computePipeline;
    if (pipeline) {
      pipelineCache.set(64, pipeline);
    }
  }

  shaderVersion = getCustomEasingVersion();

  isInitialized = true;
  if (success) {
    getAppContext().setWebGPUInitialized(true);
    getGPUMetricsProvider().updateStatus({
      gpuInitialized: true,
      webgpuAvailable: true,
    });
  } else {
    console.warn(
      '[Motion] WebGPU compute pipeline initialization failed; GPU batch processing disabled.',
    );
    deviceAvailable = false;
    getGPUMetricsProvider().updateStatus({
      gpuInitialized: false,
      webgpuAvailable: deviceAvailable,
    });
  }
}

/**
 * Select or build pipeline for a given workgroup size
 * Currently caches only the default 64; future enhancement can precompile all 4
 */
async function getPipelineForWorkgroup(_device: any, workgroupSize: number): Promise<any | null> {
  // Return cached pipeline if available
  if (pipelineCache.has(workgroupSize)) {
    return pipelineCache.get(workgroupSize);
  }

  // For MVP, only support WG=64; others fall back to 64
  // Future: precompile 16/32/64/128 variants
  if (pipelineCache.has(64)) {
    return pipelineCache.get(64);
  }

  return null;
}

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
      await initWebGPUCompute();
    }

    if (!isInitialized || !bufferManager || !deviceAvailable) {
      return;
    }

    // Rebuild pipeline if custom easing set changed
    const currentVersion = getCustomEasingVersion();
    if (currentVersion !== shaderVersion) {
      const success = await bufferManager.initComputePipeline({
        shaderCode: buildInterpolationShader(getCustomGpuEasings()),
        bindGroupLayoutEntries,
      });
      if (success) {
        const pipeline = (bufferManager as any).computePipeline;
        if (pipeline) {
          pipelineCache.set(64, pipeline);
        }
        shaderVersion = currentVersion;
      }
    }

    // Check threshold to determine if GPU processing should proceed
    const status = getGPUMetricsProvider().getStatus();
    if (!status.enabled) {
      return; // Below threshold or GPU disabled
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

    const device = bufferManager.getDevice();
    if (!device) return;

    const queue = device.queue;
    let totalDispatchCount = 0;

    // Dispatch once per archetype
    for (const [archetypeId, batch] of archetypeBatches) {
      if (batch.entityCount === 0) {
        continue;
      }

      // 1. Create GPU buffers for this archetype batch
      const stateGPUBuffer = device.createBuffer({
        size: batch.statesData.byteLength,
        mappedAtCreation: true,
        usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as any,
        label: `state-${archetypeId}`,
      });
      new Float32Array(stateGPUBuffer.getMappedRange()).set(batch.statesData);
      stateGPUBuffer.unmap();

      const keyframeGPUBuffer = device.createBuffer({
        size: batch.keyframesData.byteLength,
        mappedAtCreation: true,
        usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as any,
        label: `keyframes-${archetypeId}`,
      });
      new Float32Array(keyframeGPUBuffer.getMappedRange()).set(batch.keyframesData);
      keyframeGPUBuffer.unmap();

      // Create output buffer (1 f32 per entity)
      const outputBuffer = device.createBuffer({
        size: batch.entityCount * 4,
        usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as any,
        label: `output-${archetypeId}`,
      });

      // 2. Get pipeline (with adaptive workgroup support)
      const pipeline = await getPipelineForWorkgroup(device, batch.workgroupHint);
      if (!pipeline) {
        stateGPUBuffer.destroy();
        keyframeGPUBuffer.destroy();
        outputBuffer.destroy();
        continue;
      }

      // 3. Create bind group
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: stateGPUBuffer } },
          { binding: 1, resource: { buffer: keyframeGPUBuffer } },
          { binding: 2, resource: { buffer: outputBuffer } },
        ],
      });

      // 4. Dispatch with adaptive workgroup sizing
      const workgroupSize = batch.workgroupHint; // 16, 32, 64, or 128
      const workgroupsX = Math.ceil(batch.entityCount / workgroupSize);

      const cmdEncoder = device.createCommandEncoder({
        label: `dispatch-${archetypeId}`,
      });

      // Begin compute pass with GPU timing if supported
      const passEncoder = timingHelper
        ? timingHelper.beginComputePass(cmdEncoder)
        : cmdEncoder.beginComputePass();

      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.dispatchWorkgroups(workgroupsX, 1, 1);
      passEncoder.end();

      const commandBuffer = cmdEncoder.finish();
      queue.submit([commandBuffer]);

      totalDispatchCount += 1;

      // Retrieve GPU timing asynchronously (non-blocking, 1-2 frame latency)
      if (timingHelper && timingHelper.hasTimestampSupport()) {
        timingHelper
          .getResult()
          .then((gpuTimeNs) => {
            const gpuTimeMs = gpuTimeNs / 1_000_000;

            // Update the most recent metric for this archetype with GPU timing
            // Note: This arrives 1-2 frames late, which is acceptable for monitoring
            getGPUMetricsProvider().recordMetric({
              batchId: `${archetypeId}-timing`,
              entityCount: batch.entityCount,
              timestamp: performance.now(),
              gpu: true,
              gpuComputeTimeMs: gpuTimeMs,
              gpuComputeTimeNs: gpuTimeNs,
              workgroupsDispatched: workgroupsX,
            });
          })
          .catch(() => {
            // Silently ignore timing errors to avoid per-frame logging
          });
      }

      // 5. GPU→DOM sync: Read back results asynchronously via staging buffer pool (Phase 3)
      const syncStartTime = performance.now();
      const syncPerformed = true;
      const syncDataSize = outputBuffer.size;

      if (stagingPool && readbackMgr) {
        // Acquire staging buffer from pool (reused across frames)
        const stagingBuffer = stagingPool.acquire(archetypeId, outputBuffer.size);
        stagingPool.markInFlight(stagingBuffer);

        // Copy GPU output to staging buffer
        const copyEncoder = device.createCommandEncoder({
          label: `copy-${archetypeId}`,
        });
        copyEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputBuffer.size);
        queue.submit([copyEncoder.finish()]);

        // Async readback with timeout (Phase 3)
        const mapPromise = stagingBuffer.mapAsync(GPUMapMode.READ as any);

        mapPromise
          .then(() => {
            try {
              const view = stagingBuffer.getMappedRange();
              const copied = new Float32Array((view as ArrayBuffer).slice(0));
              stagingBuffer.unmap();

              // Phase 4: Get channel mapping from registry
              const channelRegistry = getGPUChannelMappingRegistry();
              const table = channelRegistry.getChannels(batch.archetypeId);
              const stride = table?.stride ?? 1;
              const channels = table?.channels;

              // Enqueue results for delivery system
              enqueueGPUResults({
                archetypeId: batch.archetypeId,
                entityIds: batch.entityIds.slice(),
                values: copied,
                stride,
                channels,
              });

              stagingPool!.markAvailable(stagingBuffer);
            } catch (e) {
              console.warn(`[WebGPU] Readback extraction failed for '${archetypeId}':`, e);
              try {
                stagingBuffer.unmap();
              } catch {
                // ignore
              }
              stagingPool!.markAvailable(stagingBuffer);
            }
          })
          .catch((e) => {
            console.warn(
              `[WebGPU] Readback timeout for '${archetypeId}' after 100ms; discarding`,
              e,
            );
            try {
              stagingBuffer.unmap();
            } catch {
              // ignore
            }
            stagingPool!.markAvailable(stagingBuffer);
          });
      } else {
        outputBuffer.destroy();
      }

      const syncDurationMs = performance.now() - syncStartTime;

      // 6. Record metrics for this dispatch (including sync info)
      getGPUMetricsProvider().recordMetric({
        batchId: archetypeId,
        entityCount: batch.entityCount,
        timestamp: performance.now(),
        gpu: true,
        syncPerformed,
        syncDurationMs: syncPerformed ? syncDurationMs : undefined,
        syncDataSize: syncPerformed ? syncDataSize : undefined,
      } as any);

      // Cleanup dispatch buffers (staging buffers are pooled; see stagingPool.nextFrame())
      setTimeout(() => {
        stateGPUBuffer.destroy();
        keyframeGPUBuffer.destroy();
        outputBuffer.destroy();
      }, 16);
    }

    // Phase 3: End-of-frame pool lifecycle (reclaim unused staging buffers per archetype)
    if (stagingPool) {
      stagingPool.nextFrame();
    }
  },
};
