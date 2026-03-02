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

import { createDebugger } from '@g-motion/shared';
import type {
  ArchetypeBatchDescriptor,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
} from '@g-motion/webgpu/internal';
import {
  clearPhysicsGPUEntities,
  createWebGPUFrameEncoder,
  getWebGPUEngine,
  resetWebGPUEngine,
  setPendingReadbackCount,
} from '@g-motion/webgpu/internal';
import {
  __resetKeyframePassesForTests,
  __resetOutputFormatPassForTests,
  __resetViewportCullingPassForTests,
} from '@g-motion/webgpu/testing';
import type { SystemContext, SystemDef } from '../../plugin';
import type { GPUFrameContext } from './frame-context';
import { createGPUFrameContext } from './frame-context';

import { initializeWebGPU } from './initialization';
import {
  ensureWebGPUPipelines,
  maybeSampleOutputFormatPoolStats,
} from './system/gpu-initialization-system';
import { processInterpolationArchetype } from './system/output-buffer-processor';
import { dispatchPhysicsBatchForArchetype } from './system/physics-dispatch-system';
import { processCompletedReadbacks } from './system/readback-processing-system';

export {
  disableGPUOutputFormatPass,
  enableGPUOutputFormatPass,
  processOutputBuffer,
} from '@g-motion/webgpu/internal';
export type { ProcessOutputBufferInput } from '@g-motion/webgpu/internal';
export { __getKeyframeSearchShaderModeForTests } from '@g-motion/webgpu/testing';
export { debugIO, firstEntityChannelPreview, float32Preview } from './debug';
export {
  clearPhysicsValidationShadow,
  f32,
  getPhysicsValidationShadow,
  physicsValidationShadow,
  setPhysicsValidationShadow,
  stepPhysicsShadow,
} from './physics-validation';
export { __resolveKeyframeSearchOptimizedFlagForTests } from './system-config';

const engine = getWebGPUEngine();
const warn = createDebugger('WebGPUComputeSystem', 'warn');

export function __resetWebGPUComputeSystemForTests(): void {
  engine.resetForTests();
  __resetOutputFormatPassForTests();
  __resetViewportCullingPassForTests();
  __resetKeyframePassesForTests();
  resetWebGPUEngine();
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
  order: 6,

  async update(_dt: number, ctx?: SystemContext) {
    const deps = resolveComputeDeps(ctx);
    if (!deps) return;

    const { world, metricsProvider, processor, config } = deps;

    const initResult = await initializeWebGPU(engine, { metricsProvider });
    if (engine.mockWebGPU) {
      metricsProvider.updateStatus({ enabled: true });
      return;
    }

    if (!initResult.success || !engine.deviceAvailable) {
      clearPhysicsGPUEntities();
      setPendingReadbackCount(0);
      metricsProvider.updateStatus({
        enabled: true,
        webgpuAvailable: false,
        gpuInitialized: false,
      });
      const reason = initResult.deviceInit.ok ? 'no-device' : initResult.deviceInit.reason;
      const message = initResult.deviceInit.ok
        ? 'WebGPU device not available.'
        : initResult.deviceInit.message;
      warn(message, { reason });
      return;
    }

    const device = engine.getGPUDevice();
    if (!device) {
      clearPhysicsGPUEntities();
      setPendingReadbackCount(0);
      metricsProvider.updateStatus({
        enabled: true,
        webgpuAvailable: false,
        gpuInitialized: false,
      });
      warn('WebGPU device not available.');
      return;
    }

    try {
      maybeSampleOutputFormatPoolStats({ engine, metricsProvider, config, device });
    } catch {}

    await ensureWebGPUPipelines({ engine, device, metricsProvider });

    const frameContext = createGPUFrameContext({
      world,
      processor,
      config,
      device,
      metricsProvider,
      dtMsInput: _dt,
      sampling: ctx?.sampling,
    });

    processCompletedReadbacks({
      engine,
      device,
      metricsProvider,
      processor,
      config,
      debugIOEnabled: frameContext.flags.debugIOEnabled,
    });

    metricsProvider.updateStatus({ enabled: true });

    const sp = engine.stagingPool;
    const archetypeBatches = processor.getArchetypeBatches() as Map<
      string,
      ArchetypeBatchDescriptor
    >;
    if (!sp || archetypeBatches.size === 0) return;

    engine.beginFrame();

    await processArchetypeBatches(frameContext, archetypeBatches);

    sp.nextFrame();
    engine.endFrame();
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

async function processArchetypeBatches(
  frameContext: GPUFrameContext,
  archetypeBatches: Map<string, ArchetypeBatchDescriptor>,
): Promise<void> {
  const { device, services, flags, physics } = frameContext;
  const { world, processor, config, metricsProvider } = services;
  const {
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
    batchedSubmitEnabled,
  } = flags;
  const { dtMs, dtSec, maxVelocity } = physics;
  const { gpu, queue } = device;
  const frame = batchedSubmitEnabled
    ? createWebGPUFrameEncoder({
        device: gpu,
        timingHelper: engine.timingHelper,
        label: `motion-frame-${engine.frameId}`,
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
            engine,
            device: gpu,
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
          engine,
          device: gpu,
          world,
          processor,
          metricsProvider,
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
