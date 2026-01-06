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
import { createDebugger } from '@g-motion/utils';
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
import {
  isWebGPUIODebugEnabled,
  isWebGPUViewportCullingEnabled,
  isWebGPUViewportCullingAsyncEnabled,
  resolveKeyframeSearchOptimizedFlag,
} from './system-config';
import {
  __resetOutputFormatPassForTests,
  getOutputFormatBufferPoolStats,
  releaseOutputFormatBuffer,
  runOutputFormatPass,
} from './output-format-pass';
import {
  __resetViewportCullingPassForTests,
  runViewportCullingCompactionPassAsync,
  runViewportCullingCompactionPass,
} from './viewport-culling-pass';
import {
  __resetKeyframePassesForTests,
  runKeyframeInterpPass,
  runKeyframePreprocessPass,
  runKeyframeSearchPass,
} from './keyframe-passes';

export { enableGPUOutputFormatPass, disableGPUOutputFormatPass } from './output-format-pass';
export { __resolveKeyframeSearchOptimizedFlagForTests } from './system-config';
export { __getKeyframeSearchShaderModeForTests } from './keyframe-passes';

const debugIO = createDebugger('WebGPU IO');
/**
 * Debug helpers are kept local to the system to avoid polluting internal pass modules.
 */

function float32Preview(values: Float32Array, max: number): number[] {
  const n = Math.max(0, Math.min(values.length, max));
  return Array.from(values.subarray(0, n));
}

function firstEntityChannelPreview(
  values: Float32Array,
  stride: number,
  channels?: Array<{ index: number; property: string }>,
  maxChannels = 12,
): Record<string, number> {
  const out: Record<string, number> = {};
  const s = Math.max(1, stride | 0);
  const count = Math.min(s, maxChannels);
  for (let i = 0; i < count; i++) {
    const prop = channels?.[i]?.property ?? `ch${i}`;
    out[prop] = values[i] ?? 0;
  }
  return out;
}

// Sentinel value to track initialization
let bufferManager: WebGPUBufferManager | null = null;
let isInitialized = false;
let deviceAvailable = false;
let shaderVersion = -1;
let timingHelper: TimingHelper | null = null;
let stagingPool: StagingBufferPool | null = null;
let readbackManager: AsyncReadbackManager | null = null;
let webgpuFrameId = 0;
let outputFormatStatsCounter = 0;
const latestAsyncCullingFrameByArchetype = new Map<string, number>();

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
  __resetOutputFormatPassForTests();
  __resetViewportCullingPassForTests();
  __resetKeyframePassesForTests();
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
    const world = ctx?.services.world as any;
    const metricsProvider = ctx?.services.metrics;
    const processor = ctx?.services.batchProcessor;
    const config = ctx?.services.config as any;
    const debugIOEnabled = isWebGPUIODebugEnabled(config);

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

    try {
      outputFormatStatsCounter++;
      const samplingRate = ((config as any)?.metricsSamplingRate ?? 1) as number;
      const shouldSample =
        samplingRate <= 1 || outputFormatStatsCounter % Math.max(1, Math.floor(samplingRate)) === 0;
      if (shouldSample) {
        metricsProvider.updateStatus({
          outputFormatPoolStats: getOutputFormatBufferPoolStats(device),
        } as any);
      }
    } catch {}

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

    const keyframePreprocessConfig = (config as any).keyframePreprocess as
      | { enabled?: boolean }
      | undefined;
    const preprocessEnabled = !!keyframePreprocessConfig?.enabled;

    // Process completed readbacks
    if (readbackManager) {
      const rb = readbackManager;
      // Limit readback processing to 2ms per frame to prevent blocking
      rb.drainCompleted(2).then((results) => {
        for (const res of results) {
          const tag = res.tag as any;
          if (tag && tag.kind === 'culling') {
            const latestFrame = latestAsyncCullingFrameByArchetype.get(res.archetypeId);
            const isStale =
              typeof latestFrame === 'number' &&
              typeof tag.frameId === 'number' &&
              latestFrame !== tag.frameId;

            try {
              metricsProvider.recordMetric({
                batchId: `${res.archetypeId}-cull-sync`,
                entityCount: tag.entityCountMax ?? (res.entityIds as any)?.length ?? 0,
                timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
                gpu: true,
                syncPerformed: true,
                syncDurationMs: res.syncDurationMs ?? 0,
                syncDataSize: res.byteSize,
              });
            } catch {}

            const visibleCount =
              typeof tag.visibleCount === 'number'
                ? tag.visibleCount
                : ((res.entityIds as any)?.length ?? 0);

            if (isStale || visibleCount <= 0) {
              try {
                tag.outputBuffer?.destroy?.();
              } catch {}
              if (typeof res.leaseId === 'number') {
                processor.releaseEntityIds(res.leaseId);
              }
              try {
                res.stagingBuffer.destroy();
              } catch {}
              continue;
            }

            Promise.resolve()
              .then(async () => {
                await processOutputBuffer({
                  archetypeId: res.archetypeId,
                  outputBuffer: tag.outputBuffer,
                  entityCount: visibleCount,
                  entityIdsForReadback: res.entityIds,
                  leaseId: res.leaseId,
                  rawStride: tag.rawStride,
                  outputStride: tag.outputStride,
                  rawChannels: tag.rawChannels,
                  outputChannels: tag.outputChannels,
                });
              })
              .catch(() => {
                try {
                  tag.outputBuffer?.destroy?.();
                } catch {}
                if (typeof res.leaseId === 'number') {
                  processor.releaseEntityIds(res.leaseId);
                }
              })
              .finally(() => {
                try {
                  res.stagingBuffer.destroy();
                } catch {}
              });

            continue;
          }

          const values = res.values;
          if (debugIOEnabled && values && values.length) {
            const stride = typeof res.stride === 'number' ? res.stride : 1;
            debugIO('output', {
              archetypeId: res.archetypeId,
              entityCount: (res.entityIds as any).length ?? 0,
              stride,
              expired: !!res.expired,
              channels: res.channels?.map((c) => c.property) ?? undefined,
              firstEntity: firstEntityChannelPreview(values, stride, res.channels),
              valuesPreview: float32Preview(values, Math.min(64, stride * 4)),
            });
          }
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

    const sp = stagingPool;
    const queue = device.queue;
    const channelRegistry = getGPUChannelMappingRegistry();
    const useOptimizedKeyframeSearch = resolveKeyframeSearchOptimizedFlag(config);
    const viewportCullingEnabled = !!world && isWebGPUViewportCullingEnabled(config);
    const viewportCullingAsyncEnabled =
      viewportCullingEnabled && isWebGPUViewportCullingAsyncEnabled(config);
    webgpuFrameId++;

    const processOutputBuffer = async (input: {
      archetypeId: string;
      outputBuffer: GPUBuffer;
      entityCount: number;
      entityIdsForReadback: ArrayLike<number>;
      leaseId?: number;
      rawStride: number;
      outputStride: number;
      rawChannels: Array<{ index: number; property: string }>;
      outputChannels: Array<{ index: number; property: string }>;
    }): Promise<void> => {
      const {
        archetypeId,
        outputBuffer,
        entityCount,
        entityIdsForReadback,
        leaseId,
        rawStride,
        outputStride,
        rawChannels,
        outputChannels,
      } = input;

      if (entityCount <= 0) {
        outputBuffer.destroy();
        if (typeof leaseId === 'number') {
          processor.releaseEntityIds(leaseId);
        }
        return;
      }

      const usedRawValueCount = entityCount * rawStride;
      const formattedBuffer = await runOutputFormatPass(
        device,
        queue,
        archetypeId,
        outputBuffer,
        usedRawValueCount,
        rawStride,
        outputChannels.length ? outputChannels : undefined,
      );

      const didFormat = formattedBuffer !== outputBuffer;
      const channelsForReadback = didFormat
        ? outputChannels.length
          ? outputChannels
          : undefined
        : rawChannels.length
          ? rawChannels
          : undefined;

      if (didFormat) {
        outputBuffer.destroy();
      }

      const stride = didFormat ? outputStride : rawStride;
      const bufferSize = (formattedBuffer as any).size as number | undefined;
      const expectedSize = entityCount * stride * 4;
      const byteSize = Math.min(bufferSize ?? expectedSize, expectedSize);

      const stagingBuffer = sp.acquire(archetypeId, byteSize);
      if (!stagingBuffer) {
        formattedBuffer.destroy();
        if (typeof leaseId === 'number') {
          processor.releaseEntityIds(leaseId);
        }
        return;
      }
      if (typeof leaseId === 'number') {
        processor.markEntityIdsInFlight(leaseId);
      }
      sp.markInFlight(stagingBuffer);

      const copyEncoder = device.createCommandEncoder({
        label: `copy-output-${archetypeId}`,
      });
      copyEncoder.copyBufferToBuffer(formattedBuffer, 0, stagingBuffer, 0, byteSize);
      queue.submit([copyEncoder.finish()]);
      if (didFormat) {
        releaseOutputFormatBuffer(formattedBuffer, queue);
      } else {
        formattedBuffer.destroy();
      }

      if (readbackManager) {
        const mapPromise = stagingBuffer.mapAsync((GPUMapMode as any).READ);
        readbackManager.enqueueMapAsync(
          archetypeId,
          entityIdsForReadback,
          stagingBuffer,
          mapPromise,
          byteSize,
          200,
          stride,
          channelsForReadback,
          leaseId,
        );
        setPendingReadbackCount(readbackManager.getPendingCount());
      }
    };

    for (const [archetypeId, batch] of archetypeBatches) {
      let leaseId = (batch as any).entityIdsLeaseId as number | undefined;
      const table = channelRegistry.getChannels(archetypeId);
      const outputChannels = table?.channels ?? [];
      const rawChannels = table?.rawChannels ?? outputChannels;
      const rawStride = table?.rawStride ?? (rawChannels.length || 1);
      const outputStride = table?.stride ?? (outputChannels.length || 1);

      try {
        if (debugIOEnabled) {
          debugIO('input', {
            archetypeId,
            entityCount: batch.entityCount,
            workgroupHint: batch.workgroupHint,
            keyframesVersion: batch.keyframesVersion,
            rawStride,
            outputStride,
            rawChannels: rawChannels.slice(0, 24).map((c) => c.property),
            outputChannels: outputChannels.slice(0, 24).map((c) => c.property),
            statesPreview: float32Preview(batch.statesData, Math.min(32, batch.entityCount * 4)),
            keyframesPreview: float32Preview(batch.keyframesData, 40),
            preprocessed: batch.preprocessedKeyframes
              ? {
                  rawKeyframesPerEntity: batch.preprocessedKeyframes.rawKeyframesPerEntity.map(
                    (a) => a.length,
                  ),
                  channelMapPerEntity: batch.preprocessedKeyframes.channelMapPerEntity.map(
                    (a) => a.length,
                  ),
                }
              : undefined,
          });
        }

        let outputBuffer: GPUBuffer | null = null;
        let entityCount = batch.entityCount;
        let entityIdsForReadback: ArrayLike<number> = batch.entityIds;

        if (preprocessEnabled && batch.preprocessedKeyframes && rawStride > 0) {
          const preprocessResult = await runKeyframePreprocessPass(device, queue, batch);
          if (preprocessResult) {
            const searchResult = await runKeyframeSearchPass(
              device,
              queue,
              preprocessResult,
              batch.statesData,
              rawStride,
              useOptimizedKeyframeSearch,
            );
            if (searchResult) {
              const interpOutput = await runKeyframeInterpPass(
                device,
                queue,
                preprocessResult.packedKeyframesBuffer,
                searchResult.searchResultsBuffer,
                searchResult.outputIndicesData,
                searchResult.entryCount,
                batch.entityCount,
                rawStride,
                archetypeId,
              );
              if (interpOutput) {
                outputBuffer = interpOutput;
              }
            }
          }
        }

        if (!outputBuffer) {
          const result = await dispatchGPUBatch(
            device,
            queue,
            batch,
            timingHelper,
            archetypeId,
            rawStride,
          );
          outputBuffer = result.outputBuffer;
          entityCount = result.entityCount;
        }

        if (viewportCullingEnabled && outputBuffer && entityCount > 0) {
          if (viewportCullingAsyncEnabled) {
            const pending = await runViewportCullingCompactionPassAsync(
              device,
              queue,
              world,
              archetypeId,
              batch,
              outputBuffer,
              rawStride,
            );
            if (pending) {
              latestAsyncCullingFrameByArchetype.set(archetypeId, webgpuFrameId);
              if (typeof leaseId === 'number') {
                processor.releaseEntityIds(leaseId);
                leaseId = undefined;
              }
              try {
                outputBuffer.destroy();
              } catch {}

              const cullingTag = {
                kind: 'culling' as const,
                frameId: webgpuFrameId,
                outputBuffer: pending.outputBuffer,
                rawStride,
                outputStride,
                rawChannels,
                outputChannels,
                entityCountMax: pending.entityCountMax,
              };

              const decode = (mappedRange: ArrayBuffer) => {
                const u32 = new Uint32Array(mappedRange);
                const visibleCount = Math.min(pending.entityCountMax, u32[0] >>> 0);

                let compactLeaseId: number | undefined;
                let compactEntityIds: Int32Array = new Int32Array(0);
                if (visibleCount > 0) {
                  const lease = processor.acquireEntityIds(visibleCount);
                  compactLeaseId = lease.leaseId;
                  compactEntityIds = lease.buffer.subarray(0, visibleCount);
                  compactEntityIds.set(u32.subarray(1, 1 + visibleCount) as any);
                }

                return {
                  entityIds: compactEntityIds,
                  leaseId: compactLeaseId,
                  tag: { ...cullingTag, visibleCount },
                  byteSize: 4 + visibleCount * 4,
                };
              };

              readbackManager?.enqueueMapAsyncDecoded(
                archetypeId,
                pending.readback,
                pending.mapPromise,
                4 + pending.entityCountMax * 4,
                decode as any,
                200,
                cullingTag as any,
              );
              setPendingReadbackCount(readbackManager?.getPendingCount?.() ?? 0);
              continue;
            }
          }

          const cullRes = await runViewportCullingCompactionPass(
            device,
            queue,
            world,
            processor,
            archetypeId,
            batch,
            outputBuffer,
            rawStride,
          );
          if (cullRes.outputBuffer !== outputBuffer) {
            outputBuffer.destroy();
            outputBuffer = cullRes.outputBuffer;
          }
          entityCount = cullRes.entityCount;
          entityIdsForReadback = cullRes.entityIds;
          leaseId = cullRes.leaseId;
        }

        if (!outputBuffer) {
          if (typeof leaseId === 'number') {
            processor.releaseEntityIds(leaseId);
          }
          continue;
        }
        await processOutputBuffer({
          archetypeId,
          outputBuffer,
          entityCount,
          entityIdsForReadback,
          leaseId,
          rawStride,
          outputStride,
          rawChannels,
          outputChannels,
        });
      } catch {
        if (typeof leaseId === 'number') {
          processor.releaseEntityIds(leaseId);
        }
        console.warn('[Motion][WebGPUComputeSystem] dispatchGPUBatch failed', {
          archetypeId,
          entityCount: batch.entityCount,
          rawStride,
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
