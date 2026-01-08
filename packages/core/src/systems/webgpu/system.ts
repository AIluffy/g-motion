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
import { PHYSICS_COMBINED_SHADER, PHYSICS_STATE_STRIDE } from '../../webgpu/physics-shader';
import { StagingBufferPool } from '../../webgpu/staging-pool';
import {
  clearPhysicsGPUEntities,
  enqueueGPUResults,
  markPhysicsGPUEntity,
  setPendingReadbackCount,
} from '../../webgpu/sync-manager';
import { getTimingHelper, TimingHelper } from '../../webgpu/timing-helper';
import { dispatchGPUBatch, dispatchPhysicsBatch } from './dispatch';
import { initWebGPUCompute } from './initialization';
import { precompileWorkgroupPipelines } from './pipeline';
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

const physicsValidationShadow = new Map<
  string,
  { slotCount: number; state: Float32Array; lastWarnFrame: number }
>();

function f32(n: number): number {
  return Math.fround(n);
}

function stepPhysicsShadow(
  state: Float32Array,
  dtMs: number,
  dtSec: number,
  maxVelocity: number,
): void {
  const slots = Math.floor(state.length / PHYSICS_STATE_STRIDE);
  const maxVel = f32(maxVelocity);
  for (let s = 0; s < slots; s++) {
    const base = s * PHYSICS_STATE_STRIDE;
    const kind = state[base + 14] ?? 0;

    if (kind < 0.5) {
      const position = f32(state[base + 0] ?? 0);
      const velocity = f32(state[base + 1] ?? 0);
      const target = f32(state[base + 2] ?? position);
      const stiffness = f32(state[base + 4] ?? 0);
      const damping = f32(state[base + 5] ?? 0);
      const mass = Math.max(0.001, f32(state[base + 6] ?? 1));
      const restSpeed = f32(state[base + 7] ?? 0);
      const restDelta = f32(state[base + 8] ?? 0);

      const displacement = f32(position - target);
      const force = f32(-stiffness * displacement - damping * velocity);
      const acceleration = f32(force / mass);
      let v = f32(velocity + acceleration * f32(dtSec));
      v = f32(Math.max(-maxVel, Math.min(maxVel, v)));
      let p = f32(position + v * f32(dtSec));

      const done = Math.abs(v) < restSpeed && Math.abs(displacement) < restDelta;
      if (done) {
        p = target;
        v = 0;
      }
      state[base + 0] = p;
      state[base + 1] = v;
      continue;
    }

    let position = f32(state[base + 0] ?? 0);
    let velocity = f32(state[base + 1] ?? 0);
    let mode = f32(state[base + 15] ?? 0);

    const timeConstant = Math.max(0.001, f32(state[base + 4] ?? 0));
    const minB = state[base + 5];
    const maxB = state[base + 6];
    const restSpeed = f32(state[base + 7] ?? 0);
    const restDelta = f32(state[base + 8] ?? 0);
    const clampOn = (state[base + 9] ?? 0) >= 0.5;
    const bounceOn = (state[base + 10] ?? 0) >= 0.5;
    const hasMin = Number.isFinite(minB);
    const hasMax = Number.isFinite(maxB);

    if (mode < 0.5) {
      const decayFactor = f32(Math.exp(-dtMs / timeConstant));
      velocity = f32(velocity * decayFactor);
      position = f32(position + velocity * f32(dtSec));

      let hit = false;
      let boundary = position;
      if (hasMax && position >= (maxB as number)) {
        hit = true;
        boundary = maxB as number;
      } else if (hasMin && position <= (minB as number)) {
        hit = true;
        boundary = minB as number;
      }
      if (hit) {
        position = f32(boundary);
        if (clampOn || !bounceOn) {
          velocity = 0;
        } else {
          mode = 1;
        }
      }
      state[base + 0] = position;
      state[base + 1] = velocity;
      state[base + 15] = mode;
      continue;
    }

    let springTarget = position;
    if (hasMax && position >= (maxB as number) - restDelta) {
      springTarget = maxB as number;
    } else if (hasMin && position <= (minB as number) + restDelta) {
      springTarget = minB as number;
    }

    const displacement = f32(position - f32(springTarget));
    const stiffness = f32(state[base + 11] ?? 0);
    const damping = f32(state[base + 12] ?? 0);
    const mass = Math.max(0.001, f32(state[base + 13] ?? 1));
    const force = f32(-stiffness * displacement - damping * velocity);
    const acceleration = f32(force / mass);
    velocity = f32(velocity + acceleration * f32(dtSec));
    position = f32(position + velocity * f32(dtSec));

    const done = Math.abs(velocity) < restSpeed && Math.abs(displacement) < restDelta;
    if (done) {
      mode = 0;
      velocity = 0;
      position = f32(springTarget);
    }

    state[base + 0] = position;
    state[base + 1] = velocity;
    state[base + 15] = mode;
  }
}

// Sentinel value to track initialization
let bufferManager: WebGPUBufferManager | null = null;
let isInitialized = false;
let deviceAvailable = false;
let shaderVersion = -1;
let physicsPipelinesReady = false;
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
  physicsPipelinesReady = false;
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
      clearPhysicsGPUEntities();
      setPendingReadbackCount(0);
      return;
    }

    const device = bufferManager.getDevice();

    if (!device) {
      metricsProvider.updateStatus({ cpuFallbackActive: true });
      clearPhysicsGPUEntities();
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

      const success = await precompileWorkgroupPipelines(
        device,
        buildInterpolationShader(getCustomGpuEasings()),
        bindGroupLayoutEntries,
        'main',
        'interp',
      );

      if (success) {
        shaderVersion = currentVersion;
      }
    }

    if (!physicsPipelinesReady) {
      const bindGroupLayoutEntries = [
        { binding: 0, visibility: 4, buffer: { type: 'storage' as const } },
        { binding: 1, visibility: 4, buffer: { type: 'uniform' as const } },
        { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
        { binding: 3, visibility: 4, buffer: { type: 'storage' as const } },
      ];
      const ok = await precompileWorkgroupPipelines(
        device,
        PHYSICS_COMBINED_SHADER,
        bindGroupLayoutEntries,
        'updatePhysics',
        'physics',
      );
      if (ok) {
        physicsPipelinesReady = true;
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
          if (tag && tag.kind === 'physics' && values && values.length) {
            const validateEnabled =
              (config as any)?.physicsValidation === true ||
              (config as any)?.debug?.physicsValidation === true;
            if (validateEnabled) {
              const shadow = physicsValidationShadow.get(res.archetypeId);
              const slotCount = typeof tag.slotCount === 'number' ? tag.slotCount : values.length;
              if (shadow && shadow.slotCount === slotCount) {
                stepPhysicsShadow(
                  shadow.state,
                  Number(tag.dtMs ?? 0),
                  Number(tag.dtSec ?? 0),
                  Number(tag.maxVelocity ?? 10000),
                );
                const limit = Math.min(slotCount, 2048);
                let maxAbs = 0;
                for (let s = 0; s < limit; s++) {
                  const expected = shadow.state[s * PHYSICS_STATE_STRIDE] ?? 0;
                  const got = values[s] ?? 0;
                  const abs = Math.abs(got - expected);
                  if (abs > maxAbs) maxAbs = abs;
                }
                const threshold = 1e-3;
                if (maxAbs > threshold) {
                  if (webgpuFrameId - shadow.lastWarnFrame >= 60) {
                    shadow.lastWarnFrame = webgpuFrameId;
                    try {
                      console.warn(
                        '[Motion][WebGPUComputeSystem] physics GPU validation mismatch',
                        {
                          archetypeId: res.archetypeId,
                          maxAbsError: maxAbs,
                          threshold,
                          sampleSlots: limit,
                        },
                      );
                    } catch {}
                  }
                }
              }
            }
          }
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
              finished: tag && tag.kind === 'physics' ? (tag.finished as any) : undefined,
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
    const globalSpeed = (config as any)?.globalSpeed ?? (world as any)?.config?.globalSpeed ?? 1;
    const samplingMode = ((config as any)?.samplingMode ?? 'time') as 'time' | 'frame';
    const baseDtMs =
      samplingMode === 'frame' && typeof ctx?.sampling?.deltaTimeMs === 'number'
        ? ctx!.sampling!.deltaTimeMs
        : _dt;
    const dtMs = baseDtMs * globalSpeed;
    const dtSec = dtMs / 1000;
    const maxVelocity = (config as any)?.physicsMaxVelocity ?? 10000;
    const physicsParams = new Float32Array([dtMs, dtSec, maxVelocity, 0]);
    const persistentBufferManager = getPersistentGPUBufferManager(device);
    const physicsParamsBuffer = persistentBufferManager.getOrCreateBuffer(
      'physics:params',
      physicsParams,
      (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as any,
      { label: 'physics-params', skipChangeDetection: true },
    );

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
      if ((batch as any).kind === 'physics' && (batch as any).physics) {
        const physics = (batch as any).physics as NonNullable<(typeof batch)['physics']>;
        const baseArchetypeId = physics.baseArchetypeId;
        const slotCount = physics.slotCount | 0;
        const stride = physics.stride | 0;
        const channels = physics.channels;

        try {
          const ids = batch.entityIds as ArrayLike<number>;
          for (let i = 0; i < ids.length; i++) {
            const id = ids[i] as number;
            if (typeof id === 'number' && Number.isFinite(id)) {
              markPhysicsGPUEntity(id);
            }
          }

          const requiredBytes = Math.max(0, slotCount) * PHYSICS_STATE_STRIDE * 4;
          let stateBuffer: GPUBuffer;
          if (physics.stateData && physics.stateVersion !== undefined) {
            stateBuffer = persistentBufferManager.getOrCreateBuffer(
              `physics:states:${baseArchetypeId}`,
              physics.stateData,
              (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as any,
              {
                label: `physics-states-${baseArchetypeId}`,
                allowGrowth: true,
                contentVersion: physics.stateVersion,
              },
            );
          } else {
            stateBuffer = persistentBufferManager.getOrCreateEmptyBuffer(
              `physics:states:${baseArchetypeId}`,
              requiredBytes,
              (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as any,
              {
                label: `physics-states-${baseArchetypeId}`,
                allowGrowth: true,
                contentVersion: physics.stateVersion,
              },
            ).buffer;
          }

          const validateEnabled =
            (config as any)?.physicsValidation === true ||
            (config as any)?.debug?.physicsValidation === true;
          if (validateEnabled && physics.stateData) {
            physicsValidationShadow.set(baseArchetypeId, {
              slotCount,
              state: new Float32Array(physics.stateData),
              lastWarnFrame: -1,
            });
          }

          const outputBytes = Math.max(0, slotCount) * 4;
          const finishedBytes = Math.max(0, slotCount) * 4;
          const outputBuffer = device.createBuffer({
            size: outputBytes,
            usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as any,
            label: `physics-output-${baseArchetypeId}`,
          });
          const finishedBuffer = device.createBuffer({
            size: finishedBytes,
            usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as any,
            label: `physics-finished-${baseArchetypeId}`,
          });

          await dispatchPhysicsBatch({
            device,
            queue,
            timingHelper,
            archetypeId: baseArchetypeId,
            slotCount,
            workgroupHint: batch.workgroupHint,
            stateBuffer,
            paramsBuffer: physicsParamsBuffer,
            outputBuffer,
            finishedBuffer,
          });

          const stagingSize = outputBytes + finishedBytes;
          const stagingBuffer = sp.acquire(archetypeId, stagingSize);
          if (!stagingBuffer) {
            outputBuffer.destroy();
            finishedBuffer.destroy();
            if (typeof leaseId === 'number') {
              processor.releaseEntityIds(leaseId);
            }
            continue;
          }
          if (typeof leaseId === 'number') {
            processor.markEntityIdsInFlight(leaseId);
          }
          sp.markInFlight(stagingBuffer);

          const copyEncoder = device.createCommandEncoder({
            label: `copy-physics-${baseArchetypeId}`,
          });
          copyEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputBytes);
          copyEncoder.copyBufferToBuffer(
            finishedBuffer,
            0,
            stagingBuffer,
            outputBytes,
            finishedBytes,
          );
          queue.submit([copyEncoder.finish()]);
          outputBuffer.destroy();
          finishedBuffer.destroy();

          const decode = (mappedRange: ArrayBuffer) => {
            const outValues = new Float32Array(mappedRange.slice(0, outputBytes));
            const finished = new Uint32Array(
              mappedRange.slice(outputBytes, outputBytes + finishedBytes),
            );
            return {
              archetypeId: baseArchetypeId,
              entityIds: batch.entityIds,
              values: outValues,
              stride,
              channels,
              leaseId,
              byteSize: stagingSize,
              tag: { kind: 'physics' as const, finished, dtMs, dtSec, maxVelocity, slotCount },
            };
          };

          const mapPromise = stagingBuffer.mapAsync((GPUMapMode as any).READ);
          readbackManager?.enqueueMapAsyncDecoded(
            baseArchetypeId,
            stagingBuffer,
            mapPromise,
            stagingSize,
            decode as any,
            200,
            { kind: 'physics' as const },
          );
          setPendingReadbackCount(readbackManager?.getPendingCount?.() ?? 0);
          continue;
        } catch {
          if (typeof leaseId === 'number') {
            processor.releaseEntityIds(leaseId);
          }
          continue;
        }
      }
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
