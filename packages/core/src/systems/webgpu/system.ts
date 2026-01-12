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
import type {
  ArchetypeBatchDescriptor,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
} from '../../types';
import { createDebugger } from '@g-motion/utils';
import {
  getPersistentGPUBufferManager,
  resetPersistentGPUBufferManager,
} from '../../webgpu/persistent-buffer-manager';
import { clearPhysicsGPUEntities, setPendingReadbackCount } from '../../webgpu/sync-manager';
import {
  isWebGPUIODebugEnabled,
  isWebGPUViewportCullingEnabled,
  isWebGPUViewportCullingAsyncEnabled,
  resolveKeyframeSearchOptimizedFlag,
} from './system-config';
import { __resetOutputFormatPassForTests } from './output-format';
import { __resetViewportCullingPassForTests } from './viewport';
import { __resetKeyframePassesForTests } from './keyframe';

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
  runtime.cpuFallbackLogged = false;
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
    const deps = resolveComputeDeps(ctx);
    if (!deps) return;

    const { world, metricsProvider, processor, config } = deps;

    if (shouldForceCPUFallback(metricsProvider, config)) {
      return;
    }

    const debugIOEnabled = isWebGPUIODebugEnabled(config);
    const device = await ensureRuntimeDevice(metricsProvider, config);
    if (!device) return;

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

    metricsProvider.updateStatus({ enabled: true, cpuFallbackActive: false });

    const sp = runtime.stagingPool;
    const archetypeBatches = processor.getArchetypeBatches() as Map<
      string,
      ArchetypeBatchDescriptor
    >;
    if (!sp || archetypeBatches.size === 0) return;

    runtime.webgpuFrameId++;

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

function shouldForceCPUFallback(
  metricsProvider: NonNullable<SystemContext['services']['metrics']>,
  config: NonNullable<SystemContext['services']['config']>,
): boolean {
  const gpuMode = config.gpuCompute ?? 'auto';
  if (gpuMode !== 'never') return false;
  metricsProvider.updateStatus({ cpuFallbackActive: true, enabled: false });
  setPendingReadbackCount(0);
  return true;
}

async function ensureRuntimeDevice(
  metricsProvider: NonNullable<SystemContext['services']['metrics']>,
  config: NonNullable<SystemContext['services']['config']>,
): Promise<GPUDevice | null> {
  await ensureWebGPUInitialized({ runtime, metricsProvider, config });

  if (!runtime.bufferManager || !runtime.deviceAvailable) {
    clearPhysicsGPUEntities();
    setPendingReadbackCount(0);
    return null;
  }

  const device = runtime.bufferManager.getDevice();
  if (!device) {
    metricsProvider.updateStatus({ cpuFallbackActive: true });
    clearPhysicsGPUEntities();
    setPendingReadbackCount(0);
    return null;
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
  viewportCullingEnabled: boolean;
  viewportCullingAsyncEnabled: boolean;
} {
  const preprocessEnabled = !!config.keyframePreprocess?.enabled;
  const useOptimizedKeyframeSearch = resolveKeyframeSearchOptimizedFlag(config);
  const viewportCullingEnabled = !!world && isWebGPUViewportCullingEnabled(config);
  const viewportCullingAsyncEnabled =
    viewportCullingEnabled && isWebGPUViewportCullingAsyncEnabled(config);
  return {
    preprocessEnabled,
    useOptimizedKeyframeSearch,
    viewportCullingEnabled,
    viewportCullingAsyncEnabled,
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
  viewportCullingEnabled: boolean;
  viewportCullingAsyncEnabled: boolean;
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
    viewportCullingEnabled,
    viewportCullingAsyncEnabled,
    dtMs,
    dtSec,
    maxVelocity,
  } = params;

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
        viewportCullingEnabled,
        viewportCullingAsyncEnabled,
      });
    } catch {
      if (typeof leaseId === 'number') {
        processor.releaseEntityIds(leaseId);
      }
      warn('dispatch failed', { archetypeId, entityCount: batch.entityCount });
    }
  }
}
