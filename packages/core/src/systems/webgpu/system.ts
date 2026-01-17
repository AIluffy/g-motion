/**
 * WebGPU Compute System
 *
 * Main entry point for GPU-accelerated animation compute.
 * Orchestrates initialization, pipeline management, and per-archetype dispatch.
 *
 * GPU-First Architecture:
 * - All animations attempt GPU compute by default
 *
 * Performance optimizations:
 * - Persistent GPU buffers (avoid per-frame allocation)
 * - Incremental updates (upload only changed data)
 * - Async readback with timeout management
 * - Buffer pooling and reuse
 */

import type { SystemContext, SystemDef } from '../../plugin';
import type {
  ArchetypeBatchDescriptor,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
} from '../../types';
import { createDebugger } from '@g-motion/utils';
import { ErrorCode, ErrorSeverity, MotionError } from '../../errors';
import {
  getPersistentGPUBufferManager,
  resetPersistentGPUBufferManager,
} from '../../webgpu/persistent-buffer-manager';
import { clearPhysicsGPUEntities, setPendingReadbackCount } from '../../webgpu/sync-manager';
import {
  isWebGPUIODebugEnabled,
  isKeyframeEntryExpandOnGPUEnabled,
  isKeyframeSearchIndexedEnabled,
  isWebGPUBatchedSubmitEnabled,
  isWebGPUForceStatesUploadEnabled,
  isWebGPUStatesConditionalUploadEnabled,
  isWebGPUViewportCullingEnabled,
  isWebGPUViewportCullingAsyncEnabled,
  resolveKeyframeSearchIndexedMinKeyframes,
  resolveWebGPUReadbackMode,
  resolveWebGPUOutputBufferReuseEnabled,
  resolveKeyframeSearchOptimizedFlag,
} from './system-config';
import { __resetOutputFormatPassForTests } from './output-format';
import { __resetViewportCullingPassForTests } from './viewport';
import { __resetKeyframePassesForTests } from './keyframe';
import { createWebGPUFrameEncoder } from './frame-encoder';

import { createWebGPUComputeRuntime } from './system/runtime';
import {
  ensureWebGPUInitialized,
  ensureWebGPUPipelines,
  maybeSampleOutputFormatPoolStats,
} from './system/gpu-initialization-system';
import { processCompletedReadbacks } from './system/readback-processing-system';
import { dispatchPhysicsBatchForArchetype } from './system/physics-dispatch-system';
import { processInterpolationArchetype } from './system/output-buffer-processor';

export { enableGPUOutputFormatPass, disableGPUOutputFormatPass } from './output-format';
export { __resolveKeyframeSearchOptimizedFlagForTests } from './system-config';
export { __getKeyframeSearchShaderModeForTests } from './keyframe';
export { debugIO, float32Preview, firstEntityChannelPreview } from './debug';
export {
  stepPhysicsShadow,
  f32,
  physicsValidationShadow,
  setPhysicsValidationShadow,
  clearPhysicsValidationShadow,
} from './physics-validation';
export { processOutputBuffer, ProcessOutputBufferInput } from './output-buffer-processing';
export { getPhysicsValidationShadow } from './physics-validation';

const runtime = createWebGPUComputeRuntime();
const warn = createDebugger('WebGPUComputeSystem', 'warn');

export function __resetWebGPUComputeSystemForTests(): void {
  runtime.bufferManager = null;
  runtime.isInitialized = false;
  runtime.deviceAvailable = false;
  runtime.shaderVersion = -1;
  runtime.physicsPipelinesReady = false;
  runtime.timingHelper = null;
  runtime.stagingPool = null;
  runtime.readbackManager = null;
  runtime.webgpuFrameId = 0;
  runtime.outputFormatStatsCounter = 0;
  runtime.latestAsyncCullingFrameByArchetype.clear();
  runtime.physicsParams[0] = 0;
  runtime.physicsParams[1] = 0;
  runtime.physicsParams[2] = 0;
  runtime.physicsParams[3] = 0;
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
    const deps = resolveComputeDeps(ctx);
    if (!deps) return;

    const { world, metricsProvider, processor, config } = deps;

    const debugIOEnabled = isWebGPUIODebugEnabled(config);
    await ensureWebGPUInitialized({ runtime, metricsProvider, config });
    if (runtime.mockWebGPU) {
      metricsProvider.updateStatus({ enabled: true });
      return;
    }
    if (!runtime.deviceAvailable) {
      clearPhysicsGPUEntities();
      setPendingReadbackCount(0);
      metricsProvider.updateStatus({
        enabled: true,
        webgpuAvailable: false,
        gpuInitialized: false,
      });
      return;
    }

    const device = getRuntimeDeviceOrThrow();

    try {
      maybeSampleOutputFormatPoolStats({ runtime, metricsProvider, config, device });
    } catch {}

    await ensureWebGPUPipelines({ runtime, device });

    processCompletedReadbacks({
      runtime,
      device,
      metricsProvider,
      processor,
      config,
      debugIOEnabled,
    });

    metricsProvider.updateStatus({ enabled: true });

    const sp = runtime.stagingPool;
    const archetypeBatches = processor.getArchetypeBatches() as Map<
      string,
      ArchetypeBatchDescriptor
    >;
    if (!sp || archetypeBatches.size === 0) return;

    runtime.webgpuFrameId++;
    runtime.timingHelper?.beginFrame?.();

    const { dtMs, dtSec, maxVelocity } = resolvePhysicsTiming(_dt, ctx, config);
    const flags = resolveProcessingFlags(world, config);

    await processArchetypeBatches({
      archetypeBatches,
      world,
      processor,
      config,
      device,
      debugIOEnabled,
      dtMs,
      dtSec,
      maxVelocity,
      ...flags,
    });

    sp.nextFrame();

    try {
      getPersistentGPUBufferManager().nextFrame();
    } catch {}
  },
};

function resolveComputeDeps(ctx: SystemContext | undefined): {
  world: SystemContext['services']['world'] | null;
  metricsProvider: NonNullable<SystemContext['services']['metrics']>;
  processor: NonNullable<SystemContext['services']['batchProcessor']>;
  config: NonNullable<SystemContext['services']['config']>;
} | null {
  const world = ctx?.services.world ?? null;
  const metricsProvider = ctx?.services.metrics;
  const processor = ctx?.services.batchProcessor;
  const config = ctx?.services.config;
  if (!metricsProvider || !processor || !config) return null;
  return { world, metricsProvider, processor, config };
}

function getRuntimeDeviceOrThrow(): GPUDevice {
  if (!runtime.bufferManager || !runtime.deviceAvailable) {
    clearPhysicsGPUEntities();
    setPendingReadbackCount(0);
    throw new MotionError(
      'WebGPU device not available.',
      ErrorCode.GPU_DEVICE_UNAVAILABLE,
      ErrorSeverity.FATAL,
      { stage: 'runtime', source: 'WebGPUComputeSystem.ensureRuntimeDevice' },
    );
  }

  const device = runtime.bufferManager.getDevice();
  if (!device) {
    clearPhysicsGPUEntities();
    setPendingReadbackCount(0);
    throw new MotionError(
      'WebGPU device not available.',
      ErrorCode.GPU_DEVICE_UNAVAILABLE,
      ErrorSeverity.FATAL,
      { stage: 'device', source: 'WebGPUComputeSystem.ensureRuntimeDevice' },
    );
  }

  return device;
}

function resolvePhysicsTiming(
  dtMsInput: number,
  ctx: SystemContext | undefined,
  config: NonNullable<SystemContext['services']['config']>,
): { dtMs: number; dtSec: number; maxVelocity: number } {
  const globalSpeed = config.globalSpeed ?? 1;
  const samplingMode = config.samplingMode ?? 'time';
  const baseDtMs =
    samplingMode === 'frame' && typeof ctx?.sampling?.deltaTimeMs === 'number'
      ? ctx!.sampling!.deltaTimeMs
      : dtMsInput;
  const dtMs = baseDtMs * globalSpeed;
  return {
    dtMs,
    dtSec: dtMs / 1000,
    maxVelocity: config.physicsMaxVelocity ?? 10000,
  };
}

function resolveProcessingFlags(
  world: SystemContext['services']['world'] | null,
  config: NonNullable<SystemContext['services']['config']>,
): {
  preprocessEnabled: boolean;
  useOptimizedKeyframeSearch: boolean;
  keyframeSearchIndexedEnabled: boolean;
  keyframeSearchIndexedMinKeyframes: number;
  keyframeEntryExpandOnGPUEnabled: boolean;
  viewportCullingEnabled: boolean;
  viewportCullingAsyncEnabled: boolean;
  statesConditionalUploadEnabled: boolean;
  forceStatesUploadEnabled: boolean;
  outputBufferReuseEnabled: boolean;
} {
  const preprocessEnabled = !!config.keyframePreprocess?.enabled;
  const useOptimizedKeyframeSearch = resolveKeyframeSearchOptimizedFlag(config);
  const keyframeSearchIndexedEnabled = isKeyframeSearchIndexedEnabled(config);
  const keyframeSearchIndexedMinKeyframes = resolveKeyframeSearchIndexedMinKeyframes(config);
  const keyframeEntryExpandOnGPUEnabled = isKeyframeEntryExpandOnGPUEnabled(config);
  const readbackMode = resolveWebGPUReadbackMode(config);
  const viewportCullingEnabled =
    !!world && (isWebGPUViewportCullingEnabled(config) || readbackMode === 'visible');
  const viewportCullingAsyncEnabled =
    viewportCullingEnabled && isWebGPUViewportCullingAsyncEnabled(config);
  return {
    preprocessEnabled,
    useOptimizedKeyframeSearch,
    keyframeSearchIndexedEnabled,
    keyframeSearchIndexedMinKeyframes,
    keyframeEntryExpandOnGPUEnabled,
    viewportCullingEnabled,
    viewportCullingAsyncEnabled,
    statesConditionalUploadEnabled: isWebGPUStatesConditionalUploadEnabled(config),
    forceStatesUploadEnabled: isWebGPUForceStatesUploadEnabled(config),
    outputBufferReuseEnabled: resolveWebGPUOutputBufferReuseEnabled(config),
  };
}

async function processArchetypeBatches(params: {
  archetypeBatches: Map<string, ArchetypeBatchDescriptor>;
  world: SystemContext['services']['world'] | null;
  processor: NonNullable<SystemContext['services']['batchProcessor']>;
  config: NonNullable<SystemContext['services']['config']>;
  device: GPUDevice;
  debugIOEnabled: boolean;
  preprocessEnabled: boolean;
  useOptimizedKeyframeSearch: boolean;
  keyframeSearchIndexedEnabled: boolean;
  keyframeSearchIndexedMinKeyframes: number;
  keyframeEntryExpandOnGPUEnabled: boolean;
  viewportCullingEnabled: boolean;
  viewportCullingAsyncEnabled: boolean;
  statesConditionalUploadEnabled: boolean;
  forceStatesUploadEnabled: boolean;
  outputBufferReuseEnabled: boolean;
  dtMs: number;
  dtSec: number;
  maxVelocity: number;
}): Promise<void> {
  const {
    archetypeBatches,
    world,
    processor,
    config,
    device,
    debugIOEnabled,
    preprocessEnabled,
    useOptimizedKeyframeSearch,
    keyframeSearchIndexedEnabled,
    keyframeSearchIndexedMinKeyframes,
    keyframeEntryExpandOnGPUEnabled,
    viewportCullingEnabled,
    viewportCullingAsyncEnabled,
    statesConditionalUploadEnabled,
    forceStatesUploadEnabled,
    outputBufferReuseEnabled,
    dtMs,
    dtSec,
    maxVelocity,
  } = params;

  const batchedSubmitEnabled = isWebGPUBatchedSubmitEnabled(config);
  const queue = device.queue;
  const frame = batchedSubmitEnabled
    ? createWebGPUFrameEncoder({
        device,
        timingHelper: runtime.timingHelper,
        label: `motion-frame-${runtime.webgpuFrameId}`,
      })
    : undefined;
  const pendingCommandBuffers: GPUCommandBuffer[] = [];
  const afterSubmitCallbacks: Array<() => void> = [];

  const submit = (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => {
    if (!batchedSubmitEnabled) {
      queue.submit([commandBuffer]);
      afterSubmit?.();
      return;
    }
    pendingCommandBuffers.push(commandBuffer);
    if (afterSubmit) afterSubmitCallbacks.push(afterSubmit);
  };

  const flush = () => {
    if (!batchedSubmitEnabled) {
      return;
    }
    if (frame) {
      const res = frame.finish();
      pendingCommandBuffers.push(res.commandBuffer);
      if (res.afterSubmit) afterSubmitCallbacks.push(res.afterSubmit);
    }
    if (pendingCommandBuffers.length === 0) {
      return;
    }
    const toSubmit = pendingCommandBuffers.slice();
    pendingCommandBuffers.length = 0;
    queue.submit(toSubmit);
    const callbacks = afterSubmitCallbacks.slice();
    afterSubmitCallbacks.length = 0;
    for (const cb of callbacks) cb();
  };

  try {
    for (const [archetypeId, batch] of archetypeBatches) {
      const leaseId = batch.entityIdsLeaseId;
      try {
        if (batch.kind === 'physics') {
          await dispatchPhysicsBatchForArchetype({
            runtime,
            device,
            processor,
            config,
            batch: batch as PhysicsBatchDescriptor,
            dtMs,
            dtSec,
            maxVelocity,
            frame,
            submit,
          });
          continue;
        }

        await processInterpolationArchetype({
          runtime,
          device,
          world,
          processor,
          archetypeId,
          batch: batch as GPUBatchDescriptor,
          debugIOEnabled,
          preprocessEnabled,
          useOptimizedKeyframeSearch,
          keyframeSearchIndexedEnabled,
          keyframeSearchIndexedMinKeyframes,
          keyframeEntryExpandOnGPUEnabled,
          viewportCullingEnabled,
          viewportCullingAsyncEnabled,
          statesConditionalUploadEnabled,
          forceStatesUploadEnabled,
          outputBufferReuseEnabled,
          frame,
          submit,
        });
      } catch {
        if (typeof leaseId === 'number') {
          processor.releaseEntityIds(leaseId);
        }
        warn('dispatch failed', { archetypeId, entityCount: batch.entityCount });
      }
    }
  } finally {
    flush();
  }
}
