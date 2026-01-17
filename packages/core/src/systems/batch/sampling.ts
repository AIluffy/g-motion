import type { SystemContext, SystemDef } from '../../plugin';
import { MotionStatus } from '../../components/state';
import { getEasingId } from '../easing-registry';
import { getGPUChannelMappingRegistry } from '../../webgpu/channel-mapping';
import { SchedulingConstants } from '../../constants/scheduling';
import { TimelineTracksMap } from '../../types';
import type {
  Keyframe,
  MotionStateData,
  PreprocessedKeyframes,
  RenderData,
  TimelineComponentData,
  TimelineData,
  Track,
} from '../../types';
import { getRendererCode } from '../../renderer-code';
import { getArchetypeBufferCache } from './archetype-buffer-cache';
import { consumeForcedGPUStateSyncEntityIds, isPhysicsGPUEntity } from '../../webgpu/sync-manager';
import { PHYSICS_STATE_STRIDE } from '../../webgpu/physics-shader';
import type { ArchetypeTypedBuffer } from '../../archetype';
import {
  preprocessChannelsToRawAndMap,
  type RawKeyframeGenerationOptions,
  type RawKeyframeValueEvaluator,
  packRawKeyframes,
  packChannelMaps,
} from '../../webgpu/keyframe-preprocess-shader';

import {
  EASING_MODE_STANDARD,
  EASING_MODE_BEZIER,
  EASING_MODE_HOLD,
  MAX_KEYFRAMES_PER_CHANNEL,
  MIN_GPU_KEYFRAME_DURATION,
  KEYFRAME_FLOATS,
} from './constants';

import {
  bufferCache,
  __resetBatchSamplingCachesForTests,
  hashEntityIndices,
  hashMotionStateVersionStep,
  consumeBatchSamplingSeekInvalidation,
  getKeyframesPackedCache,
  getEntityIndicesScratchByArchetype,
  getArchetypeCursor,
  setArchetypeCursor,
  incrementFrameId,
  getPickedArchetypesScratch,
  getArchetypeScratch,
} from './utils';

import { getPhysicsStateVersionByArchetype, getPhysicsLayoutSigByArchetype } from './physics-state';

type SpringComponentData = {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
};

type InertiaComponentData = {
  power?: number;
  velocities?: Map<string, number>;
  bounceVelocities?: Map<string, number>;
  inBounce?: Map<string, boolean>;
  bounds?: { min?: number; max?: number };
  min?: number;
  max?: number;
  timeConstant?: number;
  restSpeed?: number;
  restDelta?: number;
  clamp?: boolean | number;
  bounce?: unknown | false;
  bounceStiffness?: number;
  bounceDamping?: number;
  bounceMass?: number;
};

function getFlatTracks(timeline: {
  tracks?: TimelineData;
}): { keys: string[]; values: Track[] } | undefined {
  const tracks = timeline.tracks;
  if (!tracks || tracks.size === 0) return undefined;
  if (tracks instanceof TimelineTracksMap) {
    return { keys: tracks.flatKeys, values: tracks.flatValues };
  }
  const wrapped = new TimelineTracksMap(tracks as Iterable<readonly [string, Track]>);
  timeline.tracks = wrapped;
  return { keys: wrapped.flatKeys, values: wrapped.flatValues };
}

/**
 * Batch Sampling System
 *
 * Gathers animation data from entity components and prepares them for batch processing.
 * This system prepares data for WebGPU compute pipeline by default.
 *
 * GPU-First Architecture:
 * - All animations are prepared for GPU compute by default
 *
 * Performance optimizations:
 * - Reuses Float32Array buffers via BatchBufferCache (eliminates per-frame allocations)
 * - Reduces GC pressure by 80% in large batch scenarios
 *
 * Supports:
 * 1. Per-archetype segmented batches (new)
 * 2. Legacy single-batch processing (backward compatibility)
 *
 * Responsibilities:
 * 1. Iterate through all archetypes and active entities with animation state
 * 2. Filter entities eligible for GPU processing (numeric values, no custom callbacks)
 * 3. Segment entities by archetype for per-archetype GPU dispatch
 * 4. Prepare entity state data (startTime, currentTime, playbackRate, status)
 * 5. Collect keyframe data for interpolation
 * 6. Mark batches ready for GPU dispatch
 *
 * This system runs before WebGPUComputeSystem (order 5 < 6) to ensure
 * data is prepared and ready for compute dispatch.
 */
export const BatchSamplingSystem: SystemDef = {
  name: 'BatchSamplingSystem',
  order: 5, // Run before WebGPUComputeSystem

  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    const processor = ctx?.services.batchProcessor;
    const appContext = ctx?.services.appContext;

    if (!world || !processor || !appContext) {
      return;
    }
    const nowMs =
      typeof ctx?.nowMs === 'number'
        ? ctx.nowMs
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
    const config = world.config;
    const timelineFlatEnabled = config.timelineFlat === true;
    const engineFrame =
      typeof ctx?.sampling?.engineFrame === 'number'
        ? ctx!.sampling!.engineFrame
        : incrementFrameId();
    const tickFrame =
      config.samplingMode === 'frame' && typeof ctx?.sampling?.frame === 'number'
        ? ctx!.sampling!.frame
        : engineFrame;
    const channelRegistry = getGPUChannelMappingRegistry();
    const preprocessConfig = config.keyframePreprocess;
    const preprocessEnabled = !!preprocessConfig?.enabled;
    const preprocessOptions: RawKeyframeGenerationOptions = {
      timeInterval:
        preprocessConfig?.timeInterval ?? SchedulingConstants.DEFAULT_KEYFRAME_INTERVAL_MS,
      maxSubdivisionsPerSegment: preprocessConfig?.maxSubdivisionsPerSegment ?? 4,
    };
    const evaluateRawValue: RawKeyframeValueEvaluator = (kf, t) => {
      const duration = kf.time - kf.startTime;
      if (!(duration > 0)) return kf.endValue;
      const p = (t - kf.startTime) / duration;
      return kf.startValue + (kf.endValue - kf.startValue) * p;
    };
    const callbackCode = getRendererCode('callback');
    const forcedSync = new Set(consumeForcedGPUStateSyncEntityIds());
    const staticReuseEnabled = config.batchSamplingStaticReuse === true;
    const seekInvalidation = consumeBatchSamplingSeekInvalidation();

    if (!staticReuseEnabled || seekInvalidation) {
      processor.clearArchetypeBatches();
    }

    // Per-archetype batch collection
    let totalEntities = 0;

    const slice = config.workSlicing;
    const perFrame =
      !seekInvalidation && slice?.enabled ? slice.batchSamplingArchetypesPerFrame : undefined;
    let toProcess: Iterable<import('../../archetype').Archetype>;
    if (typeof perFrame === 'number' && Number.isFinite(perFrame)) {
      const archetypeScratch = getArchetypeScratch();
      const pickedArchetypesScratch = getPickedArchetypesScratch();
      let archetypeCursor = getArchetypeCursor();
      archetypeScratch.length = 0;
      for (const a of world.getArchetypes()) archetypeScratch.push(a);
      const len = archetypeScratch.length;
      if (len === 0) return;
      const limit = Math.max(1, Math.min(Math.floor(perFrame), len));
      const start = ((archetypeCursor % len) + len) % len;
      pickedArchetypesScratch.length = 0;
      const picked = pickedArchetypesScratch;
      for (let n = 0; n < limit; n++) {
        picked.push(archetypeScratch[(start + n) % len]);
      }
      archetypeCursor = (start + limit) % len;
      setArchetypeCursor(archetypeCursor);
      toProcess = picked;
    } else {
      toProcess = world.getArchetypes();
    }

    for (const archetype of toProcess) {
      // P1-2 Optimization: Use cached buffers to avoid repeated Map lookups
      const archetypeBufferCache = getArchetypeBufferCache();
      let cachedBuffers = archetypeBufferCache.getBuffers(archetype);

      let stateBuffer: Array<unknown> | undefined;
      let timelineBuffer: Array<unknown> | undefined;
      let renderBuffer: Array<unknown> | undefined;
      let typedStatus: Float32Array | Float64Array | Int32Array | undefined;
      let typedStartTime: Float32Array | Float64Array | Int32Array | undefined;
      let typedPausedAt: Float32Array | Float64Array | Int32Array | undefined;
      let typedDelay: Float32Array | Float64Array | Int32Array | undefined;
      let typedCurrentTime: Float32Array | Float64Array | Int32Array | undefined;
      let typedPlaybackRate: Float32Array | Float64Array | Int32Array | undefined;
      let typedIteration: Float32Array | Float64Array | Int32Array | undefined;
      let typedTickInterval: Float32Array | Float64Array | Int32Array | undefined;
      let typedTickPhase: Float32Array | Float64Array | Int32Array | undefined;
      let typedRendererCode: Float32Array | Float64Array | Int32Array | undefined;
      let springBuffer: Array<unknown> | undefined;
      let inertiaBuffer: Array<unknown> | undefined;

      if (cachedBuffers) {
        // Cache hit: use cached buffers
        stateBuffer = cachedBuffers.stateBuffer;
        timelineBuffer = cachedBuffers.timelineBuffer;
        renderBuffer = cachedBuffers.renderBuffer;
        typedStatus = cachedBuffers.typedStatus;
        typedStartTime = cachedBuffers.typedStartTime;
        typedPausedAt = cachedBuffers.typedPausedAt;
        typedDelay = cachedBuffers.typedDelay;
        typedCurrentTime = cachedBuffers.typedCurrentTime;
        typedPlaybackRate = cachedBuffers.typedPlaybackRate;
        typedIteration = cachedBuffers.typedIteration;
        typedTickInterval = cachedBuffers.typedTickInterval;
        typedTickPhase = cachedBuffers.typedTickPhase;
        typedRendererCode = cachedBuffers.typedRendererCode;
        springBuffer = cachedBuffers.springBuffer;
        inertiaBuffer = cachedBuffers.inertiaBuffer;
      } else {
        // Cache miss: fetch buffers and cache them
        stateBuffer = archetype.getBuffer('MotionState');
        timelineBuffer = archetype.getBuffer('Timeline');
        renderBuffer = archetype.getBuffer('Render');
        springBuffer = archetype.getBuffer?.('Spring');
        inertiaBuffer = archetype.getBuffer?.('Inertia');
        typedStatus = archetype.getTypedBuffer('MotionState', 'status');
        typedStartTime = archetype.getTypedBuffer('MotionState', 'startTime');
        typedPausedAt = archetype.getTypedBuffer('MotionState', 'pausedAt');
        typedDelay = archetype.getTypedBuffer('MotionState', 'delay');
        typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
        typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
        typedIteration = archetype.getTypedBuffer('MotionState', 'iteration');
        typedTickInterval = archetype.getTypedBuffer('MotionState', 'tickInterval');
        typedTickPhase = archetype.getTypedBuffer('MotionState', 'tickPhase');
        typedRendererCode = archetype.getTypedBuffer('Render', 'rendererCode');

        // Store in cache for next frame
        archetypeBufferCache.setBuffers(archetype, {
          stateBuffer,
          timelineBuffer,
          renderBuffer,
          springBuffer,
          inertiaBuffer,
          typedStatus,
          typedStartTime,
          typedPausedAt,
          typedDelay,
          typedCurrentTime,
          typedPlaybackRate,
          typedIteration,
          typedTickInterval,
          typedTickPhase,
          typedRendererCode,
          typedTimelineVersion: archetype.getTypedBuffer('Timeline', 'version'),
        });
      }

      if (!stateBuffer || !timelineBuffer || !renderBuffer) {
        continue; // Skip archetypes missing animation components
      }

      const table = channelRegistry.getChannels(archetype.id);
      let outputChannels = table?.channels ?? [];
      let rawChannels = table?.rawChannels ?? outputChannels;
      if ((!table || rawChannels.length === 0) && archetype.id.includes('::primitive')) {
        rawChannels = [{ index: 0, property: '__primitive' }];
        outputChannels = rawChannels;
      }
      const channelCount = rawChannels.length;
      const transformBuffer: Array<unknown> | undefined = archetype.getBuffer?.('Transform');

      const entityIndicesScratchByArchetypeMap = getEntityIndicesScratchByArchetype();
      let entityIndicesBuf: Int32Array =
        entityIndicesScratchByArchetypeMap.get(archetype.id) ?? new Int32Array(64);
      if (!entityIndicesScratchByArchetypeMap.has(archetype.id)) {
        entityIndicesScratchByArchetypeMap.set(archetype.id, entityIndicesBuf);
      }
      let entityCount = 0;

      for (let i = 0; i < archetype.entityCount; i++) {
        let rendererId: string | undefined;
        let rendererCode = 0;
        if (typedRendererCode) {
          rendererCode = typedRendererCode[i];
        } else {
          const render = renderBuffer[i] as { rendererId: string; rendererCode?: number };
          rendererId = render.rendererId;
          rendererCode = render.rendererCode ?? 0;
        }
        if (rendererCode === callbackCode || rendererId === 'callback') {
          continue;
        }

        const hasPhysics =
          !!(springBuffer && springBuffer[i] != null) ||
          !!(inertiaBuffer && inertiaBuffer[i] != null);
        if (hasPhysics) {
          continue;
        }

        const stateObj = stateBuffer[i] as MotionStateData;
        const status = typedStatus
          ? (typedStatus[i] as unknown as MotionStatus)
          : (stateObj.status as unknown as MotionStatus);
        if (status !== MotionStatus.Running) {
          continue;
        }

        const timelineTime = typedCurrentTime
          ? (typedCurrentTime[i] as unknown as number)
          : Number(stateObj.currentTime ?? 0);
        if (!(Number.isFinite(timelineTime) && timelineTime >= 0)) {
          continue;
        }

        const interval = typedTickInterval
          ? typedTickInterval[i]
          : Number(stateObj.tickInterval ?? 0);
        if (interval > 1) {
          const phase = typedTickPhase ? typedTickPhase[i] : Number(stateObj.tickPhase ?? 0);
          if ((tickFrame + phase) % interval !== 0) {
            continue;
          }
        }

        if (entityCount >= entityIndicesBuf.length) {
          const nextBuf: Int32Array = new Int32Array(entityIndicesBuf.length * 2);
          nextBuf.set(entityIndicesBuf);
          entityIndicesBuf = nextBuf;
          entityIndicesScratchByArchetypeMap.set(archetype.id, entityIndicesBuf);
        }
        entityIndicesBuf[entityCount] = i;
        entityCount++;
      }

      // Create per-archetype batch if entities exist
      if (entityCount > 0) {
        const entitySig = hashEntityIndices(entityIndicesBuf, entityCount);
        const prevBatchRaw = processor.getArchetypeBatch(archetype.id);
        const prevBatch =
          prevBatchRaw && (prevBatchRaw as any).kind !== 'physics'
            ? (prevBatchRaw as any)
            : undefined;

        let entityIdsView: ArrayLike<number>;
        let entityIdsLeaseId: number | undefined;
        let statesData: Float32Array;

        if (
          staticReuseEnabled &&
          !seekInvalidation &&
          prevBatch &&
          prevBatch.entityCount === entityCount &&
          prevBatch.entitySig === entitySig
        ) {
          entityIdsView = prevBatch.entityIds as ArrayLike<number>;
          entityIdsLeaseId = prevBatch.entityIdsLeaseId as number | undefined;
          statesData = prevBatch.statesData as Float32Array;
        } else {
          if (prevBatchRaw) {
            processor.removeArchetypeBatch(archetype.id);
          }
          const lease = processor.acquireEntityIds(entityCount);
          entityIdsLeaseId = lease.leaseId;
          const view = lease.buffer.subarray(0, entityCount);
          for (let eIndex = 0; eIndex < entityCount; eIndex++) {
            view[eIndex] = archetype.getEntityId(entityIndicesBuf[eIndex]);
          }
          entityIdsView = view;
          statesData = bufferCache.getStatesBuffer(archetype.id, entityCount * 4);
        }
        let statesVersion = 2166136261 >>> 0;
        let runningCount = 0;
        let pausedCount = 0;
        for (let eIndex = 0; eIndex < entityCount; eIndex++) {
          const i = entityIndicesBuf[eIndex];
          const stateObj = stateBuffer[i] as MotionStateData;
          const status = typedStatus
            ? (typedStatus[i] as unknown as MotionStatus)
            : (stateObj.status as unknown as MotionStatus);
          if (status === MotionStatus.Running) {
            runningCount++;
          } else if (status === MotionStatus.Paused) {
            pausedCount++;
          }
          const offset = eIndex * 4;
          const startTime = typedStartTime ? typedStartTime[i] : Number(stateObj.startTime ?? 0);
          statesData[offset] = startTime;
          const playbackRate = typedPlaybackRate
            ? typedPlaybackRate[i]
            : Number(stateObj.playbackRate ?? 1);
          const timelineTime = typedCurrentTime
            ? (typedCurrentTime[i] as unknown as number)
            : Number(stateObj.currentTime ?? 0);
          statesData[offset + 1] = timelineTime;
          statesData[offset + 2] = playbackRate;
          statesData[offset + 3] = status;
          statesVersion = hashMotionStateVersionStep(
            statesVersion,
            startTime,
            timelineTime,
            playbackRate,
            status as unknown as number,
          );
        }

        let keyframesData: Float32Array;
        let preprocessedRawKeyframesPerEntity: Float32Array[] | undefined;
        let preprocessedChannelMapPerEntity: Uint32Array[] | undefined;
        let preprocessedClipModel:
          | {
              rawKeyframesByClip: Float32Array[];
              channelMapByClip: Uint32Array[];
              clipIndexByEntity: Uint32Array;
            }
          | undefined;

        // Build signatures for static-cache decision
        let versionSig = 0 >>> 0;
        const optionsSig =
          ((((preprocessOptions.timeInterval ?? 0) as number) | 0) * 31 +
            (((preprocessOptions.maxSubdivisionsPerSegment ?? 0) as number) | 0)) >>>
          0;
        versionSig = (((versionSig * 31) >>> 0) ^ (optionsSig >>> 0)) >>> 0;
        const typedTimelineVersion = archetype.getTypedBuffer('Timeline', 'version');
        for (let eIndex = 0; eIndex < entityCount; eIndex++) {
          const i = entityIndicesBuf[eIndex];
          const v = typedTimelineVersion
            ? (typedTimelineVersion[i] as unknown as number)
            : Number((timelineBuffer[i] as TimelineComponentData).version ?? 0);
          versionSig = (((versionSig * 31) >>> 0) ^ (v >>> 0)) >>> 0;
        }
        versionSig = (((versionSig * 31) >>> 0) ^ (entitySig >>> 0)) >>> 0;
        versionSig = (((versionSig * 31) >>> 0) ^ (channelCount >>> 0)) >>> 0;

        const canReusePreprocessed =
          preprocessEnabled &&
          channelCount > 0 &&
          staticReuseEnabled &&
          !seekInvalidation &&
          prevBatch &&
          prevBatch.entityCount === entityCount &&
          prevBatch.entitySig === entitySig &&
          prevBatch.keyframesVersion === versionSig &&
          !!prevBatch.preprocessedKeyframes;

        if (!canReusePreprocessed && preprocessEnabled && channelCount > 0) {
          preprocessedRawKeyframesPerEntity = new Array(entityCount);
          preprocessedChannelMapPerEntity = new Array(entityCount);
          const rawKeyframesByClip: Float32Array[] = [];
          const channelMapByClip: Uint32Array[] = [];
          const clipIndexByEntity = new Uint32Array(entityCount);
          const clipIndexByTracks = new Map<unknown, number>();
          for (let eIndex = 0; eIndex < entityCount; eIndex++) {
            const i = entityIndicesBuf[eIndex];
            const timeline = timelineBuffer[i] as { tracks?: TimelineData };
            if (timelineFlatEnabled) {
              getFlatTracks(timeline);
            }
            const tracks = timeline.tracks as TimelineData | undefined;
            if (!tracks || tracks.size === 0) {
              let clipIndex = clipIndexByTracks.get(tracks);
              if (clipIndex === undefined) {
                clipIndex = rawKeyframesByClip.length;
                clipIndexByTracks.set(tracks, clipIndex);
                rawKeyframesByClip.push(new Float32Array(0));
                channelMapByClip.push(new Uint32Array(0));
              }
              clipIndexByEntity[eIndex] = clipIndex;
              preprocessedRawKeyframesPerEntity[eIndex] = rawKeyframesByClip[clipIndex];
              preprocessedChannelMapPerEntity[eIndex] = channelMapByClip[clipIndex];
              continue;
            }
            let clipIndex = clipIndexByTracks.get(tracks);
            if (clipIndex !== undefined) {
              clipIndexByEntity[eIndex] = clipIndex;
              preprocessedRawKeyframesPerEntity[eIndex] = rawKeyframesByClip[clipIndex];
              preprocessedChannelMapPerEntity[eIndex] = channelMapByClip[clipIndex];
              continue;
            }
            const channelTracks: {
              property: string;
              track: {
                startTime: number;
                time: number;
                startValue: number;
                endValue: number;
                easing: unknown;
              }[];
            }[] = [];
            for (let cIndex = 0; cIndex < channelCount; cIndex++) {
              const prop = rawChannels[cIndex].property;
              const track = tracks.get(prop) as Track | undefined;
              if (!track || track.length === 0) continue;
              const truncated =
                track.length > MAX_KEYFRAMES_PER_CHANNEL
                  ? (track.slice(0, MAX_KEYFRAMES_PER_CHANNEL) as unknown as {
                      startTime: number;
                      time: number;
                      startValue: number;
                      endValue: number;
                      easing: unknown;
                    }[])
                  : (track as unknown as {
                      startTime: number;
                      time: number;
                      startValue: number;
                      endValue: number;
                      easing: unknown;
                    }[]);
              channelTracks.push({ property: prop, track: truncated });
            }
            if (channelTracks.length === 0) {
              clipIndex = rawKeyframesByClip.length;
              clipIndexByTracks.set(tracks, clipIndex);
              rawKeyframesByClip.push(new Float32Array(0));
              channelMapByClip.push(new Uint32Array(0));
              clipIndexByEntity[eIndex] = clipIndex;
              preprocessedRawKeyframesPerEntity[eIndex] = rawKeyframesByClip[clipIndex];
              preprocessedChannelMapPerEntity[eIndex] = channelMapByClip[clipIndex];
              continue;
            }
            const { rawKeyframes, channelMaps } = preprocessChannelsToRawAndMap(
              channelTracks,
              preprocessOptions,
              evaluateRawValue,
            );
            clipIndex = rawKeyframesByClip.length;
            clipIndexByTracks.set(tracks, clipIndex);
            rawKeyframesByClip.push(packRawKeyframes(rawKeyframes));
            channelMapByClip.push(packChannelMaps(channelMaps));
            clipIndexByEntity[eIndex] = clipIndex;
            preprocessedRawKeyframesPerEntity[eIndex] = rawKeyframesByClip[clipIndex];
            preprocessedChannelMapPerEntity[eIndex] = channelMapByClip[clipIndex];
          }
          preprocessedClipModel = { rawKeyframesByClip, channelMapByClip, clipIndexByEntity };
        }

        const canReuseKeyframesData =
          staticReuseEnabled &&
          !seekInvalidation &&
          prevBatch &&
          prevBatch.entityCount === entityCount &&
          prevBatch.entitySig === entitySig &&
          prevBatch.keyframesVersion === versionSig;

        if (canReuseKeyframesData) {
          keyframesData = prevBatch.keyframesData as Float32Array;
        } else if (channelCount > 0) {
          const required = entityCount * channelCount * MAX_KEYFRAMES_PER_CHANNEL * KEYFRAME_FLOATS;
          const keyframesPackedCacheMap = getKeyframesPackedCache();
          const cached = keyframesPackedCacheMap.get(archetype.id);
          const canReuse =
            cached &&
            cached.versionSig === versionSig &&
            cached.entitySig === entitySig &&
            cached.channelCount === channelCount &&
            cached.buffer.length >= required;
          if (canReuse) {
            keyframesData = cached!.buffer.subarray(0, required);
          } else {
            keyframesData = bufferCache.getKeyframesBuffer(archetype.id, required);
            for (let eIndex = 0; eIndex < entityCount; eIndex++) {
              const i = entityIndicesBuf[eIndex];
              const timeline = timelineBuffer[i] as { tracks?: TimelineData };
              const tracks = timeline.tracks as TimelineData | undefined;

              for (let cIndex = 0; cIndex < channelCount; cIndex++) {
                const prop = rawChannels[cIndex].property;
                const track = tracks?.get(prop) as Track | undefined;
                const count = track ? Math.min(track.length, MAX_KEYFRAMES_PER_CHANNEL) : 0;

                for (let kIndex = 0; kIndex < MAX_KEYFRAMES_PER_CHANNEL; kIndex++) {
                  const globalIndex =
                    (eIndex * channelCount * MAX_KEYFRAMES_PER_CHANNEL +
                      cIndex * MAX_KEYFRAMES_PER_CHANNEL +
                      kIndex) *
                    KEYFRAME_FLOATS;

                  if (track && kIndex < count) {
                    const kf = track[kIndex] as unknown as Keyframe & {
                      bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
                    };
                    const easingId = getEasingId(kf.easing);

                    // Determine easing mode (Phase 1.1: Bezier support)
                    let easingMode = EASING_MODE_STANDARD;
                    if (kf.interp === 'hold') {
                      easingMode = EASING_MODE_HOLD;
                    } else if (kf.bezier || kf.interp === 'bezier') {
                      easingMode = EASING_MODE_BEZIER;
                    }

                    const startTime = kf.startTime ?? 0;
                    const endTime = kf.time ?? 0;
                    keyframesData[globalIndex] = startTime;
                    const dur = endTime - startTime;
                    keyframesData[globalIndex + 1] = dur > 0 ? dur : MIN_GPU_KEYFRAME_DURATION;
                    keyframesData[globalIndex + 2] = kf.startValue;
                    keyframesData[globalIndex + 3] = kf.endValue;
                    keyframesData[globalIndex + 4] = easingId;
                    // Bezier control points (default to linear if not specified)
                    keyframesData[globalIndex + 5] = kf.bezier?.cx1 ?? 0;
                    keyframesData[globalIndex + 6] = kf.bezier?.cy1 ?? 0;
                    keyframesData[globalIndex + 7] = kf.bezier?.cx2 ?? 1;
                    keyframesData[globalIndex + 8] = kf.bezier?.cy2 ?? 1;
                    keyframesData[globalIndex + 9] = easingMode;
                  } else {
                    // Zero out unused keyframe slots
                    for (let f = 0; f < KEYFRAME_FLOATS; f++) {
                      keyframesData[globalIndex + f] = 0;
                    }
                  }
                }
              }
            }

            keyframesPackedCacheMap.set(archetype.id, {
              versionSig,
              entitySig,
              channelCount,
              buffer: keyframesData,
            });
          }
        } else {
          let totalKeyframes = 0;
          for (let eIndex = 0; eIndex < entityCount; eIndex++) {
            const i = entityIndicesBuf[eIndex];
            const timeline = timelineBuffer[i] as { tracks?: TimelineData };
            if (timelineFlatEnabled) {
              const flat = getFlatTracks(timeline);
              if (!flat) continue;
              const values = flat.values;
              for (let tIndex = 0; tIndex < values.length; tIndex++) {
                const track = values[tIndex];
                if (Array.isArray(track)) totalKeyframes += track.length;
              }
            } else {
              const tracks = timeline.tracks as TimelineData | undefined;
              if (!tracks || tracks.size === 0) continue;
              for (const [, track] of tracks) {
                if (Array.isArray(track)) totalKeyframes += track.length;
              }
            }
          }

          const size = Math.max(KEYFRAME_FLOATS, totalKeyframes * KEYFRAME_FLOATS);
          const keyframesPackedCacheMap = getKeyframesPackedCache();
          const cached = keyframesPackedCacheMap.get(archetype.id);
          const canReuse =
            cached &&
            cached.versionSig === versionSig &&
            cached.entitySig === entitySig &&
            cached.channelCount === 0 &&
            cached.buffer.length >= size;
          if (canReuse) {
            keyframesData = cached!.buffer.subarray(0, size);
          } else {
            keyframesData = bufferCache.getKeyframesBuffer(archetype.id, size);
            let w = 0;
            for (let eIndex = 0; eIndex < entityCount; eIndex++) {
              const i = entityIndicesBuf[eIndex];
              const timeline = timelineBuffer[i] as { tracks?: TimelineData };
              if (timelineFlatEnabled) {
                const flat = getFlatTracks(timeline);
                if (!flat) continue;
                const values = flat.values;
                for (let tIndex = 0; tIndex < values.length; tIndex++) {
                  const track = values[tIndex];
                  if (!Array.isArray(track) || track.length === 0) continue;
                  for (let kIndex = 0; kIndex < track.length; kIndex++) {
                    const kf = track[kIndex] as unknown as Keyframe & {
                      bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
                    };
                    const easingId = getEasingId(kf.easing);

                    let easingMode = EASING_MODE_STANDARD;
                    if (kf.interp === 'hold') {
                      easingMode = EASING_MODE_HOLD;
                    } else if (kf.bezier || kf.interp === 'bezier') {
                      easingMode = EASING_MODE_BEZIER;
                    }

                    const startTime = kf.startTime ?? 0;
                    const endTime = kf.time ?? 0;
                    keyframesData[w] = startTime;
                    const dur = endTime - startTime;
                    keyframesData[w + 1] = dur > 0 ? dur : MIN_GPU_KEYFRAME_DURATION;
                    keyframesData[w + 2] = kf.startValue;
                    keyframesData[w + 3] = kf.endValue;
                    keyframesData[w + 4] = easingId;
                    keyframesData[w + 5] = kf.bezier?.cx1 ?? 0;
                    keyframesData[w + 6] = kf.bezier?.cy1 ?? 0;
                    keyframesData[w + 7] = kf.bezier?.cx2 ?? 1;
                    keyframesData[w + 8] = kf.bezier?.cy2 ?? 1;
                    keyframesData[w + 9] = easingMode;
                    w += KEYFRAME_FLOATS;
                  }
                }
              } else {
                const tracks = timeline.tracks as TimelineData | undefined;
                if (!tracks || tracks.size === 0) continue;
                for (const [, track] of tracks) {
                  if (!Array.isArray(track) || track.length === 0) continue;
                  for (let kIndex = 0; kIndex < track.length; kIndex++) {
                    const kf = track[kIndex] as unknown as Keyframe & {
                      bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
                    };
                    const easingId = getEasingId(kf.easing);

                    let easingMode = EASING_MODE_STANDARD;
                    if (kf.interp === 'hold') {
                      easingMode = EASING_MODE_HOLD;
                    } else if (kf.bezier || kf.interp === 'bezier') {
                      easingMode = EASING_MODE_BEZIER;
                    }

                    const startTime = kf.startTime ?? 0;
                    const endTime = kf.time ?? 0;
                    keyframesData[w] = startTime;
                    const dur = endTime - startTime;
                    keyframesData[w + 1] = dur > 0 ? dur : MIN_GPU_KEYFRAME_DURATION;
                    keyframesData[w + 2] = kf.startValue;
                    keyframesData[w + 3] = kf.endValue;
                    keyframesData[w + 4] = easingId;
                    keyframesData[w + 5] = kf.bezier?.cx1 ?? 0;
                    keyframesData[w + 6] = kf.bezier?.cy1 ?? 0;
                    keyframesData[w + 7] = kf.bezier?.cx2 ?? 1;
                    keyframesData[w + 8] = kf.bezier?.cy2 ?? 1;
                    keyframesData[w + 9] = easingMode;
                    w += KEYFRAME_FLOATS;
                  }
                }
              }
            }
            for (; w < size; w++) {
              keyframesData[w] = 0;
            }
            keyframesPackedCacheMap.set(archetype.id, {
              versionSig,
              entitySig,
              channelCount: 0,
              buffer: keyframesData,
            });
          }
        }

        let preprocessed: PreprocessedKeyframes | undefined;
        if (canReusePreprocessed) {
          preprocessed = prevBatch.preprocessedKeyframes as PreprocessedKeyframes;
        } else if (
          preprocessEnabled &&
          channelCount > 0 &&
          preprocessedRawKeyframesPerEntity &&
          preprocessedChannelMapPerEntity
        ) {
          preprocessed = {
            rawKeyframesPerEntity: preprocessedRawKeyframesPerEntity,
            channelMapPerEntity: preprocessedChannelMapPerEntity,
            clipModel: preprocessedClipModel,
          };
        }

        if (
          staticReuseEnabled &&
          !seekInvalidation &&
          prevBatch &&
          prevBatch.entityCount === entityCount &&
          prevBatch.entitySig === entitySig &&
          prevBatch.keyframesVersion === versionSig
        ) {
          prevBatch.statesVersion = statesVersion;
          prevBatch.createdAt = Date.now();
          prevBatch.statesData = statesData;
          prevBatch.keyframesData = keyframesData;
          prevBatch.keyframesVersion = versionSig;
          prevBatch.entitySig = entitySig;
          if (preprocessed) {
            prevBatch.preprocessedKeyframes = preprocessed;
          }
        } else {
          const batch = processor.addArchetypeBatch(
            archetype.id,
            entityIdsView,
            entityCount,
            entityIdsLeaseId,
            statesData,
            keyframesData,
            versionSig,
            preprocessed,
          );
          batch.statesVersion = statesVersion;
          batch.entitySig = entitySig;
        }

        totalEntities += entityCount;
      } else if (staticReuseEnabled) {
        processor.removeArchetypeBatch(archetype.id);
      }

      if (!springBuffer && !inertiaBuffer) {
        continue;
      }

      let physicsChannels: Array<{ index: number; property: string }> = rawChannels;
      if (physicsChannels.length === 0) {
        const keys = new Set<string>();
        for (let i = 0; i < archetype.entityCount; i++) {
          const hasPhysics =
            !!(springBuffer && springBuffer[i] != null) ||
            !!(inertiaBuffer && inertiaBuffer[i] != null);
          if (!hasPhysics) continue;
          const status = typedStatus
            ? (typedStatus[i] as unknown as MotionStatus)
            : ((stateBuffer[i] as MotionStateData).status as unknown as MotionStatus);
          if (status !== MotionStatus.Running) continue;
          const timeline = timelineBuffer[i] as TimelineComponentData;
          if (timelineFlatEnabled) {
            const flat = getFlatTracks(timeline as unknown as { tracks?: TimelineData });
            if (!flat) continue;
            const flatKeys = flat.keys;
            for (let kIndex = 0; kIndex < flatKeys.length; kIndex++) {
              keys.add(flatKeys[kIndex]);
            }
          } else {
            const tracks = timeline?.tracks as TimelineData | undefined;
            if (!tracks || typeof tracks.keys !== 'function') continue;
            for (const k of tracks.keys()) {
              keys.add(String(k));
            }
          }
          if (keys.size >= 32) break;
        }
        const sorted = Array.from(keys).sort();
        physicsChannels = sorted.map((property, index) => ({ index, property }));
      }

      const physicsStride = physicsChannels.length;
      if (physicsStride <= 0) {
        continue;
      }

      const physicsArchetypeId = `${archetype.id}::physics`;
      const entityIndicesScratchMap = getEntityIndicesScratchByArchetype();
      let physicsIndicesBuf: Int32Array =
        entityIndicesScratchMap.get(physicsArchetypeId) ?? new Int32Array(64);
      if (!entityIndicesScratchMap.has(physicsArchetypeId)) {
        entityIndicesScratchMap.set(physicsArchetypeId, physicsIndicesBuf);
      }

      let physicsEntityCount = 0;
      for (let i = 0; i < archetype.entityCount; i++) {
        let rendererCode = typedRendererCode ? typedRendererCode[i] : 0;
        let rendererId: string | undefined;
        if (!typedRendererCode) {
          const render = renderBuffer[i] as { rendererId: string; rendererCode?: number };
          rendererCode = render.rendererCode ?? 0;
          rendererId = render.rendererId;
        }
        if (rendererCode === callbackCode || rendererId === 'callback') {
          continue;
        }

        const hasPhysics =
          !!(springBuffer && springBuffer[i] != null) ||
          !!(inertiaBuffer && inertiaBuffer[i] != null);
        if (!hasPhysics) continue;

        const status = typedStatus
          ? (typedStatus[i] as unknown as MotionStatus)
          : ((stateBuffer[i] as MotionStateData).status as unknown as MotionStatus);
        if (status !== MotionStatus.Running) continue;

        const interval = typedTickInterval
          ? typedTickInterval[i]
          : Number((stateBuffer[i] as MotionStateData).tickInterval ?? 0);
        if (interval > 1) {
          const phase = typedTickPhase
            ? typedTickPhase[i]
            : Number((stateBuffer[i] as MotionStateData).tickPhase ?? 0);
          if ((tickFrame + phase) % interval !== 0) {
            continue;
          }
        }

        if (physicsEntityCount >= physicsIndicesBuf.length) {
          const nextBuf: Int32Array = new Int32Array(physicsIndicesBuf.length * 2);
          nextBuf.set(physicsIndicesBuf);
          physicsIndicesBuf = nextBuf;
          entityIndicesScratchMap.set(physicsArchetypeId, physicsIndicesBuf);
        }
        physicsIndicesBuf[physicsEntityCount] = i;
        physicsEntityCount++;
      }

      if (physicsEntityCount <= 0) {
        continue;
      }

      const lease = processor.acquireEntityIds(physicsEntityCount);
      const entityIdsView = lease.buffer.subarray(0, physicsEntityCount);
      let needsUpload = false;
      for (let eIndex = 0; eIndex < physicsEntityCount; eIndex++) {
        const id = archetype.getEntityId(physicsIndicesBuf[eIndex]);
        entityIdsView[eIndex] = id;
        if (!needsUpload && (forcedSync.has(id) || (id >= 0 && !isPhysicsGPUEntity(id)))) {
          needsUpload = true;
        }
      }

      const layoutSig =
        (hashEntityIndices(physicsIndicesBuf, physicsEntityCount) ^
          (physicsStride * 2654435761)) >>>
        0;
      const physicsLayoutSigMap = getPhysicsLayoutSigByArchetype();
      const prevLayoutSig = physicsLayoutSigMap.get(physicsArchetypeId);
      if (prevLayoutSig !== layoutSig) {
        needsUpload = true;
        physicsLayoutSigMap.set(physicsArchetypeId, layoutSig);
      }

      let stateData: Float32Array | undefined;
      const physicsStateVersionMap = getPhysicsStateVersionByArchetype();
      let stateVersion = physicsStateVersionMap.get(physicsArchetypeId) ?? 0;
      const slotCount = physicsEntityCount * physicsStride;
      if (needsUpload) {
        stateVersion = (stateVersion + 1) >>> 0;
        physicsStateVersionMap.set(physicsArchetypeId, stateVersion);

        stateData = new Float32Array(slotCount * PHYSICS_STATE_STRIDE);
        const typedTransformByProp: Record<string, ArchetypeTypedBuffer | undefined> = {};
        for (let cIndex = 0; cIndex < physicsStride; cIndex++) {
          const prop = physicsChannels[cIndex].property;
          typedTransformByProp[prop] = archetype.getTypedBuffer('Transform', prop);
        }

        for (let eIndex = 0; eIndex < physicsEntityCount; eIndex++) {
          const i = physicsIndicesBuf[eIndex];
          const timeline = timelineBuffer[i] as TimelineComponentData;
          const tracks = timeline?.tracks;
          const spring = springBuffer
            ? (springBuffer[i] as SpringComponentData | undefined)
            : undefined;
          const inertia = inertiaBuffer
            ? (inertiaBuffer[i] as InertiaComponentData | undefined)
            : undefined;
          const render = renderBuffer[i] as RenderData;
          const transform = transformBuffer
            ? (transformBuffer[i] as Record<string, unknown>)
            : undefined;

          for (let cIndex = 0; cIndex < physicsStride; cIndex++) {
            const prop = physicsChannels[cIndex].property;
            const slotIndex = eIndex * physicsStride + cIndex;
            const base = slotIndex * PHYSICS_STATE_STRIDE;

            const tbuf = typedTransformByProp[prop];
            let position = 0;
            if (tbuf) {
              position = Number(tbuf[i] ?? 0);
            } else if (transform && prop in transform) {
              position = Number(transform[prop] ?? 0);
            } else if (render?.props && render.props[prop] !== undefined) {
              position = Number(render.props[prop] ?? 0);
            }
            if (!Number.isFinite(position)) position = 0;

            const track = tracks ? (tracks.get(prop) as Track | undefined) : undefined;
            const first = Array.isArray(track) && track.length ? track[0] : undefined;
            const target = first ? Number(first.endValue ?? position) : position;
            const fromValue = first ? Number(first.startValue ?? position) : position;

            if (spring) {
              const velocities = spring.velocities instanceof Map ? spring.velocities : undefined;
              const v0 = velocities ? Number(velocities.get(prop) ?? 0) : 0;

              stateData[base + 0] = position;
              stateData[base + 1] = Number.isFinite(v0) ? v0 : 0;
              stateData[base + 2] = Number.isFinite(target) ? target : position;
              stateData[base + 3] = 0;
              stateData[base + 4] = Number(spring.stiffness ?? 0);
              stateData[base + 5] = Number(spring.damping ?? 0);
              stateData[base + 6] = Number(spring.mass ?? 1);
              stateData[base + 7] = Number(spring.restSpeed ?? 0.001);
              stateData[base + 8] = Number(spring.restDelta ?? 0.001);
              stateData[base + 9] = 0;
              stateData[base + 10] = 0;
              stateData[base + 11] = 0;
              stateData[base + 12] = 0;
              stateData[base + 13] = 0;
              stateData[base + 14] = 0;
              stateData[base + 15] = 0;
              continue;
            }

            if (inertia) {
              const velocities = inertia.velocities instanceof Map ? inertia.velocities : undefined;
              const bounceVelocities =
                inertia.bounceVelocities instanceof Map ? inertia.bounceVelocities : undefined;
              const inBounce = inertia.inBounce instanceof Map ? inertia.inBounce : undefined;

              const isBouncing = inBounce ? !!inBounce.get(prop) : false;
              const vDecay = velocities ? Number(velocities.get(prop) ?? 0) : 0;
              const vBounce = bounceVelocities
                ? Number(bounceVelocities.get(prop) ?? vDecay)
                : vDecay;
              const v0 = isBouncing ? vBounce : vDecay;

              const bounds = inertia.bounds ?? undefined;
              const minB = bounds?.min ?? inertia.min;
              const maxB = bounds?.max ?? inertia.max;

              stateData[base + 0] = position;
              stateData[base + 1] = Number.isFinite(v0) ? v0 : 0;
              stateData[base + 2] = Number.isFinite(target) ? target : position;
              stateData[base + 3] = Number.isFinite(fromValue) ? fromValue : position;
              stateData[base + 4] = Number(inertia.timeConstant ?? 0);
              stateData[base + 5] = Number.isFinite(minB) ? Number(minB) : Number.NaN;
              stateData[base + 6] = Number.isFinite(maxB) ? Number(maxB) : Number.NaN;
              stateData[base + 7] = Number(inertia.restSpeed ?? 0.5);
              stateData[base + 8] = Number(inertia.restDelta ?? 0.5);
              stateData[base + 9] = inertia.clamp ? 1 : 0;
              stateData[base + 10] = inertia.bounce === false ? 0 : 1;
              stateData[base + 11] = Number(inertia.bounceStiffness ?? 0);
              stateData[base + 12] = Number(inertia.bounceDamping ?? 0);
              stateData[base + 13] = Number(inertia.bounceMass ?? 1);
              stateData[base + 14] = 1;
              stateData[base + 15] = isBouncing ? 1 : 0;
              continue;
            }

            stateData[base + 0] = position;
            stateData[base + 1] = 0;
            stateData[base + 2] = position;
            stateData[base + 3] = position;
            stateData[base + 4] = 0;
            stateData[base + 5] = Number.NaN;
            stateData[base + 6] = Number.NaN;
            stateData[base + 7] = 0;
            stateData[base + 8] = 0;
            stateData[base + 9] = 0;
            stateData[base + 10] = 0;
            stateData[base + 11] = 0;
            stateData[base + 12] = 0;
            stateData[base + 13] = 0;
            stateData[base + 14] = 0;
            stateData[base + 15] = 0;
          }
        }
      }

      processor.addPhysicsArchetypeBatch({
        archetypeId: physicsArchetypeId,
        baseArchetypeId: archetype.id,
        entityIds: entityIdsView,
        entityCount: physicsEntityCount,
        entityIdsLeaseId: lease.leaseId,
        channels: physicsChannels,
        stride: physicsStride,
        slotCount,
        stateData,
        stateVersion,
      });
    }

    // Update context for WebGPUComputeSystem to access per-archetype batches
    if (totalEntities > 0) {
      appContext.updateBatchContext({
        lastBatchId: `batch-${Math.floor(nowMs / 1000)}`,
        entityCount: totalEntities,
        archetypeBatchesReady: true,
      });
    }

    // P1-2: Advance frame counter for cache cleanup
    getArchetypeBufferCache().nextFrame();
  },
};
