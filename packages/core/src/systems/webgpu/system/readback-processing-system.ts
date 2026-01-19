import type { MotionAppConfig } from '../../../plugin';
import type { GPUMetricsProvider } from '../../../webgpu/metrics-provider';
import type { ComputeBatchProcessor } from '../../batch';
import { enqueueGPUResults, setPendingReadbackCount } from '../../../webgpu/sync-manager';
import { PHYSICS_STATE_STRIDE } from '../../../webgpu/physics-shader';
import { WebGPUConstants } from '../../../constants/webgpu';
import { createDebugger } from '@g-motion/utils';
import { stepPhysicsShadow, physicsValidationShadow } from '../physics-validation';
import { processOutputBuffer } from '../../../webgpu/output-buffer-processing';
import type { WebGPUEngine } from '../../../webgpu/engine';
import type { CullingReadbackTag } from './viewport-culling-system';
import type { PhysicsReadbackTag } from './physics-dispatch-system';
import { maybeDebugReadbackOutput } from './output-buffer-processor';
import { tryReleasePooledOutputBufferFromTag } from '../../../webgpu/output-buffer-pool';

const warn = createDebugger('WebGPUComputeSystem', 'warn');

export function processCompletedReadbacks(params: {
  engine: WebGPUEngine;
  device: GPUDevice;
  metricsProvider: GPUMetricsProvider;
  processor: ComputeBatchProcessor;
  config: MotionAppConfig;
  debugIOEnabled: boolean;
}): void {
  const { engine, device, metricsProvider, processor, config, debugIOEnabled } = params;

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
            timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            gpu: true,
            syncPerformed: true,
            syncDurationMs: res.syncDurationMs ?? 0,
            syncDataSize: res.byteSize,
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
          tryReleasePooledOutputBufferFromTag(sourceOutputBufferTag);
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
            await processOutputBuffer(device, queue, sp, readbackManager, processor, {
              archetypeId: res.archetypeId,
              outputBuffer: cullingTag.outputBuffer,
              entityCount: visibleCount,
              entityIdsForReadback: res.entityIds,
              leaseId: res.leaseId,
              rawStride: cullingTag.rawStride,
              outputStride: cullingTag.outputStride,
              rawChannels: cullingTag.rawChannels,
              outputChannels: cullingTag.outputChannels,
            });
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
            tryReleasePooledOutputBufferFromTag(sourceOutputBufferTag);
            try {
              res.stagingBuffer.destroy();
            } catch {}
          });

        continue;
      }

      const values = res.values;
      if (res.expired) {
        sp.markAvailable(res.stagingBuffer);
        tryReleasePooledOutputBufferFromTag(res.tag);
        if (typeof res.leaseId === 'number') {
          processor.releaseEntityIds(res.leaseId);
        }
        continue;
      }
      if (kind === 'physics' && values && values.length) {
        const physicsTag = tag as PhysicsReadbackTag;
        const validateEnabled =
          config.physicsValidation === true || config.debug?.physicsValidation === true;
        if (validateEnabled) {
          const shadow = physicsValidationShadow.get(res.archetypeId);
          const slotCount =
            typeof physicsTag.slotCount === 'number' ? physicsTag.slotCount : values.length;
          if (shadow && shadow.slotCount === slotCount) {
            stepPhysicsShadow(
              shadow.state,
              Number(physicsTag.dtMs ?? 0),
              Number(physicsTag.dtSec ?? 0),
              Number(physicsTag.maxVelocity ?? WebGPUConstants.GPU.PHYSICS_MAX_VELOCITY_DEFAULT),
            );
            const limit = Math.min(slotCount, 2048);
            let maxAbs = 0;
            for (let s = 0; s < limit; s++) {
              const expected = shadow.state[s * PHYSICS_STATE_STRIDE] ?? 0;
              const got = values[s] ?? 0;
              const abs = Math.abs(got - expected);
              if (abs > maxAbs) maxAbs = abs;
            }
            const threshold = WebGPUConstants.GPU.PHYSICS_SETTLE_THRESHOLD_DEFAULT;
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
        enqueueGPUResults({
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
          timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
          gpu: true,
          syncPerformed: true,
          syncDurationMs: res.syncDurationMs ?? 0,
          syncDataSize: res.byteSize,
        });
      } catch {}

      tryReleasePooledOutputBufferFromTag(res.tag);
      sp.markAvailable(res.stagingBuffer);

      if (typeof res.leaseId === 'number') {
        processor.releaseEntityIds(res.leaseId);
      }
    }
    setPendingReadbackCount(readbackManager.getPendingCount());
  });

  setPendingReadbackCount(readbackManager.getPendingCount());
}
