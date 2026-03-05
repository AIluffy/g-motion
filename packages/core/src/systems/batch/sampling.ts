/**
 * Batch Sampling System – Orchestration Entry Point
 *
 * Pure wiring — no inline GPU-packing logic. Sub-modules:
 *   archetype-buffers      – resolve SoA/AoS component buffers
 *   entity-filter          – filter keyframe-animation entities
 *   physics-entity-filter  – filter physics entities + fill entity-ID array
 *   batch-builder          – state-pack + keyframe-serialize + cache-reuse
 *   physics-assembler      – assemble Spring/Inertia state + channel discovery
 *   physics-state          – per-archetype physics layout/version tracking
 *
 * System order 5, runs before WebGPUComputeSystem (order 6).
 */

import { getNowMs } from '@g-motion/shared';
import { getGPUModuleSync } from '../../runtime/gpu-access';
import type {
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
} from '../../runtime/gpu-types';
import type { ArchetypeBatchDescriptor, PhysicsBatchDescriptor } from '../../runtime/gpu-types';
import { SchedulingConstants } from '../../constants';
import type { SystemContext, SystemDef } from '../../runtime/plugin';
import { getArchetypeBufferCache } from './archetype-buffer-cache';
import { resolveArchetypeBuffers } from './archetype-buffers';
import { buildAnimationBatch } from './batch-builder';
import { filterEntitiesForGPU } from './entity-filter';
import { assemblePhysicsState, discoverPhysicsChannels } from './physics-assembler';
import { fillPhysicsEntityIds, filterPhysicsEntities } from './physics-entity-filter';
import { getPhysicsLayoutSigByArchetype, getPhysicsStateVersionByArchetype } from './physics-state';
import {
  consumeBatchSamplingSeekInvalidation,
  getArchetypeCursor,
  getArchetypeScratch,
  getPickedArchetypesScratch,
  hashEntityIndices,
  incrementFrameId,
  setArchetypeCursor,
} from './utils';

export const BatchSamplingSystem: SystemDef = {
  name: 'BatchSamplingSystem',
  order: 5,

  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    const processor = ctx?.services.batchProcessor;
    const appContext = ctx?.services.appContext;
    if (!world || !processor || !appContext) return;

    const gpu = getGPUModuleSync();
    if (!gpu) return;

    const nowMs = typeof ctx?.nowMs === 'number' ? ctx.nowMs : getNowMs();
    const config = world.config;
    const forcedWorkgroupSize = config.webgpu?.forceWorkgroupSize;
    gpu.setForcedWorkgroupSize?.(
      typeof forcedWorkgroupSize === 'number' ? forcedWorkgroupSize : null,
    );
    const timelineFlatEnabled = config.keyframe?.timelineFlat === true;
    const staticReuseEnabled = config.batchSamplingStaticReuse === true;
    const seekInvalidation = consumeBatchSamplingSeekInvalidation();
    const engineFrame =
      typeof ctx?.sampling?.engineFrame === 'number'
        ? ctx!.sampling!.engineFrame
        : incrementFrameId();
    const tickFrame =
      config.samplingMode === 'frame' && typeof ctx?.sampling?.frame === 'number'
        ? ctx!.sampling!.frame
        : engineFrame;
    const preprocessConfig = config.keyframe?.preprocess;
    const preprocessEnabled = !!preprocessConfig?.enabled;
    const preprocessOptions: RawKeyframeGenerationOptions = {
      timeInterval:
        preprocessConfig?.timeInterval ?? SchedulingConstants.DEFAULT_KEYFRAME_INTERVAL_MS,
      maxSubdivisionsPerSegment: preprocessConfig?.maxSubdivisionsPerSegment ?? 4,
    };
    const evaluateRawValue: RawKeyframeValueEvaluator = (kf, t) => {
      const d = kf.time - kf.startTime;
      return d > 0
        ? kf.startValue + (kf.endValue - kf.startValue) * ((t - kf.startTime) / d)
        : kf.endValue;
    };
    const forcedSync = gpu.consumeForcedGPUStateSyncEntityIdsSet?.() ?? new Set<number>();
    if (!staticReuseEnabled || seekInvalidation) processor.clearArchetypeBatches();

    // Archetype work-slicing
    let toProcess: Iterable<import('../../ecs/archetype').Archetype>;
    const perFrame =
      !seekInvalidation && config.workSlicing?.enabled
        ? config.workSlicing.batchSamplingArchetypesPerFrame
        : undefined;
    if (typeof perFrame === 'number' && Number.isFinite(perFrame)) {
      const s = getArchetypeScratch();
      s.length = 0;
      for (const a of world.getArchetypes()) s.push(a);
      if (!s.length) return;
      const limit = Math.max(1, Math.min(Math.floor(perFrame), s.length));
      const start = ((getArchetypeCursor() % s.length) + s.length) % s.length;
      const p = getPickedArchetypesScratch();
      p.length = 0;
      for (let n = 0; n < limit; n++) p.push(s[(start + n) % s.length]);
      setArchetypeCursor((start + limit) % s.length);
      toProcess = p;
    } else {
      toProcess = world.getArchetypes();
    }

    let totalEntities = 0;
    const channelRegistry = gpu.getGPUChannelMappingRegistry();

    for (const archetype of toProcess) {
      const bufs = resolveArchetypeBuffers(archetype);
      if (!bufs) continue;
      const {
        stateBuffer,
        timelineBuffer,
        renderBuffer,
        springBuffer,
        inertiaBuffer,
        typedStatus,
        typedStartTime,
        typedCurrentTime,
        typedPlaybackRate,
        typedTickInterval,
        typedTickPhase,
        typedRendererCode,
      } = bufs;
      const table = channelRegistry.getChannels(archetype.id);
      let rawChannels = table?.rawChannels ?? table?.channels ?? [];
      if ((!table || !rawChannels.length) && archetype.id.includes('::primitive'))
        rawChannels = [{ index: 0, property: '__primitive' }];
      const channelCount = rawChannels.length;
      const transformBuffer = archetype.getBuffer?.('Transform') as Array<unknown> | undefined;

      // ── Animation keyframe batch ──────────────────────────────────────────
      const { entityIndicesBuf, entityCount } = filterEntitiesForGPU({
        archetypeId: archetype.id,
        entityCount: archetype.entityCount,
        stateBuffer,
        renderBuffer,
        springBuffer,
        inertiaBuffer,
        typedStatus,
        typedCurrentTime,
        typedRendererCode,
        typedTickInterval,
        typedTickPhase,
        tickFrame,
      });
      if (entityCount > 0) {
        const prevBatchRaw = processor.getArchetypeBatch(archetype.id);
        const prevBatch = isAnimationBatch(prevBatchRaw) ? prevBatchRaw : undefined;
        buildAnimationBatch({
          archetypeId: archetype.id,
          entityIndicesBuf,
          entityCount,
          stateBuffer,
          timelineBuffer,
          rawChannels,
          channelCount,
          typedStatus,
          typedStartTime,
          typedCurrentTime,
          typedPlaybackRate,
          typedTimelineVersion: archetype.getTypedBuffer('Timeline', 'version'),
          preprocessEnabled,
          timelineFlatEnabled,
          preprocessOptions,
          evaluateRawValue,
          staticReuseEnabled,
          seekInvalidation,
          prevBatch,
          acquireEntityIds: (n) => processor.acquireEntityIds(n),
          getEntityId: (idx) => archetype.getEntityId(idx),
          addArchetypeBatch: (id, eids, ec, lid, sd, kd, ver, pp) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            processor.addArchetypeBatch(id, eids, ec, lid, sd, kd, ver, pp) as any,
          removeArchetypeBatch: (id) => processor.removeArchetypeBatch(id),
        });
        totalEntities += entityCount;
      } else if (staticReuseEnabled) {
        processor.removeArchetypeBatch(archetype.id);
      }

      // ── Physics batch ─────────────────────────────────────────────────────
      if (!springBuffer && !inertiaBuffer) continue;
      let physicsChannels = rawChannels;
      if (!physicsChannels.length) {
        physicsChannels = discoverPhysicsChannels(
          archetype.entityCount,
          stateBuffer,
          timelineBuffer,
          springBuffer,
          inertiaBuffer,
          typedStatus,
        );
      }
      const physicsStride = physicsChannels.length;
      if (!physicsStride) continue;
      const physicsArchId = `${archetype.id}::physics`;
      const { physicsIndicesBuf, physicsEntityCount } = filterPhysicsEntities({
        physicsArchetypeId: physicsArchId,
        entityCount: archetype.entityCount,
        stateBuffer,
        renderBuffer,
        springBuffer: springBuffer!,
        inertiaBuffer: inertiaBuffer!,
        typedStatus,
        typedRendererCode,
        typedTickInterval,
        typedTickPhase,
        tickFrame,
      });
      if (!physicsEntityCount) continue;
      const pLease = processor.acquireEntityIds(physicsEntityCount);
      const physEids = pLease.buffer.subarray(0, physicsEntityCount);
      const needsUploadBase = fillPhysicsEntityIds(
        physicsIndicesBuf,
        physicsEntityCount,
        (idx) => archetype.getEntityId(idx),
        forcedSync,
        (entityId) => gpu.isPhysicsGPUEntity?.(entityId) ?? false,
        physEids,
      );
      const lsMap = getPhysicsLayoutSigByArchetype();
      const layoutSig =
        (hashEntityIndices(physicsIndicesBuf, physicsEntityCount) ^
          (physicsStride * 2654435761)) >>>
        0;
      const needsUpload = needsUploadBase || lsMap.get(physicsArchId) !== layoutSig;
      if (needsUpload) lsMap.set(physicsArchId, layoutSig);
      const svMap = getPhysicsStateVersionByArchetype();
      const { stateData, stateVersion, slotCount } = assemblePhysicsState(
        {
          physicsArchetypeId: physicsArchId,
          archetypeId: archetype.id,
          entityIndicesBuf: physicsIndicesBuf,
          entityCount: physicsEntityCount,
          channels: physicsChannels,
          stride: physicsStride,
          timelineBuffer,
          renderBuffer,
          springBuffer: springBuffer!,
          inertiaBuffer: inertiaBuffer!,
          transformBuffer,
          getTypedTransformBuffer: (p) => archetype.getTypedBuffer('Transform', p),
        },
        needsUpload,
        svMap.get(physicsArchId) ?? 0,
      );
      if (needsUpload) svMap.set(physicsArchId, stateVersion);
      processor.addPhysicsArchetypeBatch({
        archetypeId: physicsArchId,
        baseArchetypeId: archetype.id,
        entityIds: physEids,
        entityCount: physicsEntityCount,
        entityIdsLeaseId: pLease.leaseId,
        channels: physicsChannels,
        stride: physicsStride,
        slotCount,
        stateData,
        stateVersion,
      });
    }

    if (totalEntities > 0) {
      appContext.updateBatchContext({
        lastBatchId: `batch-${Math.floor(nowMs / 1000)}`,
        entityCount: totalEntities,
        archetypeBatchesReady: true,
      });
    }
    getArchetypeBufferCache().nextFrame();
  },
};

const isAnimationBatch = (
  batch: ArchetypeBatchDescriptor | undefined,
): batch is Exclude<ArchetypeBatchDescriptor, PhysicsBatchDescriptor> =>
  !!batch && batch.kind !== 'physics';
