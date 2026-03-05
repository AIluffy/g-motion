import { createDebugger, getNowMs, GPU_DEFAULTS } from '@g-motion/shared';
import type { GPUMetricsProvider, WebGPUEngine } from '../../bridge/types';
import { getGPUModuleSync, PHYSICS_STATE_STRIDE } from '../../bridge';
import type { NormalizedMotionAppConfig } from '@g-motion/core/runtime';
import type { ComputeBatchProcessor } from '@g-motion/core/batch';
import { physicsValidationShadow, stepPhysicsShadow } from '../physics-validation';
import { maybeDebugReadbackOutput } from './output-buffer-processor';
import type { PhysicsReadbackTag } from './physics-dispatch-system';
import type { CullingReadbackTag } from './viewport-culling-system';

const warn = createDebugger('WebGPUComputeSystem', 'warn');

export function processCompletedReadbacks(params: {
  engine: WebGPUEngine;
  device: GPUDevice;
  metricsProvider: GPUMetricsProvider;
  processor: ComputeBatchProcessor;
  config: NormalizedMotionAppConfig;
  debugIOEnabled: boolean;
}): void {
  const { engine, device, metricsProvider, processor, config, debugIOEnabled } = params;

  const gpu = getGPUModuleSync();
  if (!gpu) return;

  const readbackManager = engine.readbackManager;
  const sp = engine.stagingPool;
  if (!readbackManager || !sp) {
    return;
  }

  const queue = device.queue;

  readbackManager.drainCompleted(2).then((results) => {
    for (const res of results) {
      const tag = res.tag as unknown;
      const tagObj = tag && typeof tag === 'object' ? (tag as Record<string, unknown>) : undefined;
      const kind = typeof tagObj?.kind === 'string' ? (tagObj.kind as string) : undefined;
      const released = (res as { released?: boolean }).released === true;

      if (kind === 'culling') {
        const cullingTag = tag as CullingReadbackTag;
        const sourceOutputBufferTag = cullingTag.sourceOutputBufferTag;
        const latestFrame = engine.latestAsyncCullingFrameByArchetype.get(res.archetypeId);
        const isStale =
          typeof latestFrame === 'number' &&
          typeof cullingTag.frameId === 'number' &&
          latestFrame !== cullingTag.frameId;

        try {
          metricsProvider.recordMetric({
            batchId: `${res.archetypeId}-cull-sync`,
            entityCount: cullingTag.entityCountMax ?? res.entityIds.length,
            timestamp: getNowMs(),
            gpu: true,
            syncPerformed: true,
            syncDurationMs: res.syncDurationMs ?? 0,
            syncDataSize: res.byteSize,
            syncExpired: !!res.expired,
            syncTimeoutRate: readbackManager.getTimeoutRate(),
            syncQueueDepth: readbackManager.getQueueDepth(),
          });
        } catch {}

        const visibleCount =
          typeof cullingTag.visibleCount === 'number'
            ? cullingTag.visibleCount
            : res.entityIds.length;

        if (res.expired || isStale || visibleCount <= 0) {
          try {
            cullingTag.outputBuffer?.destroy?.();
          } catch {}
          gpu.tryReleasePooledOutputBufferFromTag?.(sourceOutputBufferTag);
          if (typeof res.leaseId === 'number') {
            processor.releaseEntityIds(res.leaseId);
          }
          if (!released) {
            try {
              res.stagingBuffer.destroy();
            } catch {}
          }
          continue;
        }

        Promise.resolve()
          .then(async () => {
            await gpu.processOutputBuffer(
              device,
              queue,
              sp,
              readbackManager,
              processor,
              {
                archetypeId: res.archetypeId,
                outputBuffer: cullingTag.outputBuffer,
                entityCount: visibleCount,
                entityIdsForReadback: res.entityIds,
                leaseId: res.leaseId,
                rawStride: cullingTag.rawStride,
                outputStride: cullingTag.outputStride,
                rawChannels: cullingTag.rawChannels,
                outputChannels: cullingTag.outputChannels,
              },
              undefined,
              undefined,
              metricsProvider,
            );
          })
          .catch(() => {
            try {
              cullingTag.outputBuffer?.destroy?.();
            } catch {}
            if (typeof res.leaseId === 'number') {
              processor.releaseEntityIds(res.leaseId);
            }
          })
          .finally(() => {
            gpu.tryReleasePooledOutputBufferFromTag?.(sourceOutputBufferTag);
            if (!released) {
              try {
                res.stagingBuffer.destroy();
              } catch {}
            }
          });

        continue;
      }

      const values = res.values;
      if (res.expired) {
        try {
          metricsProvider.recordMetric({
            batchId: `${res.archetypeId}-sync`,
            entityCount: res.entityIds.length,
            timestamp: getNowMs(),
            gpu: true,
            syncPerformed: true,
            syncDurationMs: res.syncDurationMs ?? 0,
            syncDataSize: res.byteSize,
            syncExpired: true,
            syncTimeoutRate: readbackManager.getTimeoutRate(),
            syncQueueDepth: readbackManager.getQueueDepth(),
          });
        } catch {}
        if (!released) {
          sp.markAvailable(res.stagingBuffer);
          gpu.tryReleasePooledOutputBufferFromTag?.(res.tag);
        }
        if (typeof res.leaseId === 'number') {
          processor.releaseEntityIds(res.leaseId);
        }
        continue;
      }
      if (kind === 'physics' && values && values.length) {
        const physicsTag = tag as PhysicsReadbackTag;
        const validateEnabled = config.debug?.physicsValidation === true;
        if (validateEnabled) {
          const shadow = physicsValidationShadow.get(res.archetypeId);
          const slotCount =
            typeof physicsTag.slotCount === 'number' ? physicsTag.slotCount : values.length;
          if (shadow && shadow.slotCount === slotCount) {
            stepPhysicsShadow(
              shadow.state,
              Number(physicsTag.dtMs ?? 0),
              Number(physicsTag.dtSec ?? 0),
              Number(physicsTag.maxVelocity ?? GPU_DEFAULTS.GPU.PHYSICS_MAX_VELOCITY_DEFAULT),
            );
            const limit = Math.min(slotCount, 2048);
            let maxAbs = 0;
            for (let s = 0; s < limit; s++) {
              const expected = shadow.state[s * PHYSICS_STATE_STRIDE] ?? 0;
              const got = values[s] ?? 0;
              const abs = Math.abs(got - expected);
              if (abs > maxAbs) maxAbs = abs;
            }
            const threshold = GPU_DEFAULTS.GPU.PHYSICS_SETTLE_THRESHOLD_DEFAULT;
            if (maxAbs > threshold) {
              if (engine.frameId - shadow.lastWarnFrame >= 60) {
                shadow.lastWarnFrame = engine.frameId;
                try {
                  warn('physics GPU validation mismatch', {
                    archetypeId: res.archetypeId,
                    maxAbsError: maxAbs,
                    threshold,
                    sampleSlots: limit,
                  });
                } catch {}
              }
            }
          }
        }
      }

      if (debugIOEnabled && values && values.length) {
        const stride = typeof res.stride === 'number' ? res.stride : 1;
        maybeDebugReadbackOutput({
          archetypeId: res.archetypeId,
          entityIds: res.entityIds,
          stride,
          values,
          channels: res.channels,
          expired: !!res.expired,
        });
      }

      if (values && values.length) {
        gpu.enqueueGPUResults?.({
          archetypeId: res.archetypeId,
          entityIds: res.entityIds,
          values,
          stride: res.stride,
          channels: res.channels,
          finished:
            kind === 'physics' && (tag as PhysicsReadbackTag).finished instanceof Uint32Array
              ? (tag as PhysicsReadbackTag).finished
              : undefined,
        });
      }

      try {
        metricsProvider.recordMetric({
          batchId: `${res.archetypeId}-sync`,
          entityCount: res.entityIds.length,
          timestamp: getNowMs(),
          gpu: true,
          syncPerformed: true,
          syncDurationMs: res.syncDurationMs ?? 0,
          syncDataSize: res.byteSize,
          syncExpired: !!res.expired,
          syncTimeoutRate: readbackManager.getTimeoutRate(),
          syncQueueDepth: readbackManager.getQueueDepth(),
        });
      } catch {}

      if (!released) {
        gpu.tryReleasePooledOutputBufferFromTag?.(res.tag);
        sp.markAvailable(res.stagingBuffer);
      }

      if (typeof res.leaseId === 'number') {
        processor.releaseEntityIds(res.leaseId);
      }
    }
    const pending = readbackManager.getPendingCount();
    gpu.setPendingReadbackCount?.(pending);
    try {
      metricsProvider.updateStatus({
        queueDepth: pending,
        timeoutRate: readbackManager.getTimeoutRate(),
      });
    } catch {}
  });

  const pending = readbackManager.getPendingCount();
  gpu.setPendingReadbackCount?.(pending);
  try {
    metricsProvider.updateStatus({
      queueDepth: pending,
      timeoutRate: readbackManager.getTimeoutRate(),
    });
  } catch {}
}
