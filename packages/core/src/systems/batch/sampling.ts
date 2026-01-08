import type { SystemContext } from '../../plugin';
import { SystemDef } from '../../plugin';
import { MotionStatus } from '../../components/state';
import { getEasingId } from '../easing-registry';
import { BatchBufferCache } from './buffer-cache';
import { getGPUChannelMappingRegistry } from '../../webgpu/channel-mapping';
import type { TimelineData, Track, Keyframe } from '../../types';
import { getRendererCode } from '../../renderer-code';
import { getArchetypeBufferCache, resetArchetypeBufferCache } from './archetype-buffer-cache'; // P1-2: Buffer cache
import { KEYFRAME_STRIDE } from '../../webgpu/shader'; // Phase 1.1: Extended keyframe support
import { consumeForcedGPUStateSyncEntityIds, isPhysicsGPUEntity } from '../../webgpu/sync-manager';
import { PHYSICS_STATE_STRIDE } from '../../webgpu/physics-shader';
import {
  preprocessChannelsToRawAndMap,
  type RawKeyframeGenerationOptions,
  type RawKeyframeValueEvaluator,
  packRawKeyframes,
  packChannelMaps,
} from '../../webgpu/keyframe-preprocess-shader';

// Easing mode constants (matching shader EASING_MODE)
const EASING_MODE_STANDARD = 0;
const EASING_MODE_BEZIER = 1;
const EASING_MODE_HOLD = 2;

const bufferCache = new BatchBufferCache();
const MAX_KEYFRAMES_PER_CHANNEL = 4;
const MIN_GPU_KEYFRAME_DURATION = 0.0001;

// Use extended keyframe stride (10 floats) for Bezier support
const KEYFRAME_FLOATS = KEYFRAME_STRIDE; // 10 floats per keyframe

const archetypeScratch: any[] = [];
const pickedArchetypesScratch: any[] = [];
let archetypeCursor = 0;

const entityIndicesScratchByArchetype = new Map<string, Int32Array>();

let frameId = 0;

const keyframesPackedCache = new Map<
  string,
  { versionSig: number; entitySig: number; channelCount: number; buffer: Float32Array }
>();

const physicsStateVersionByArchetype = new Map<string, number>();
const physicsLayoutSigByArchetype = new Map<string, number>();

/**
 * Clear all internal caches. Useful for testing.
 */
export function __resetBatchSamplingCachesForTests(): void {
  keyframesPackedCache.clear();
  entityIndicesScratchByArchetype.clear();
  archetypeScratch.length = 0;
  pickedArchetypesScratch.length = 0;
  archetypeCursor = 0;
  frameId = 0;
  bufferCache.clear();
  resetArchetypeBufferCache();
}

function hashEntityIndices(buf: Int32Array, len: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < len; i++) {
    h ^= buf[i] >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Batch Sampling System
 *
 * Gathers animation data from entity components and prepares them for batch processing.
 * This system prepares data for WebGPU compute pipeline by default.
 *
 * GPU-First Architecture:
 * - All animations are prepared for GPU compute by default
 * - CPU fallback is handled by InterpolationSystem when GPU is unavailable
 * - config.gpuCompute='never' explicitly disables GPU path
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
    const metrics = ctx?.services.metrics;
    const processor = ctx?.services.batchProcessor;
    const appContext = ctx?.services.appContext;

    if (!world || !metrics || !processor || !appContext) {
      return;
    }
    const now = performance.now();
    const config = world.config;
    const engineFrame =
      typeof ctx?.sampling?.engineFrame === 'number' ? ctx!.sampling!.engineFrame : frameId++;
    const tickFrame =
      (config as any).samplingMode === 'frame' && typeof ctx?.sampling?.frame === 'number'
        ? ctx!.sampling!.frame
        : engineFrame;
    const channelRegistry = getGPUChannelMappingRegistry();
    const preprocessConfig = (config as any).keyframePreprocess as
      | { enabled?: boolean; timeInterval?: number; maxSubdivisionsPerSegment?: number }
      | undefined;
    const preprocessEnabled = !!preprocessConfig?.enabled;
    const preprocessOptions: RawKeyframeGenerationOptions = {
      timeInterval: preprocessConfig?.timeInterval ?? 16,
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
    const gpuStatus = metrics.getStatus?.();
    const gpuActive =
      !!gpuStatus?.enabled && !!gpuStatus?.gpuInitialized && !gpuStatus?.cpuFallbackActive;

    // GPU-First: Only skip if explicitly disabled
    if (config.gpuCompute === 'never') {
      processor.clearArchetypeBatches();
      return;
    }

    // Always prepare batches for GPU (GPU-first architecture)
    // CPU fallback is handled by InterpolationSystem when GPU unavailable

    // Clear previous archetype batches (per-frame refresh)
    processor.clearArchetypeBatches();

    // Per-archetype batch collection
    let totalEntities = 0;

    const slice = (config as any).workSlicing as
      | {
          enabled?: boolean;
          batchSamplingArchetypesPerFrame?: number;
        }
      | undefined;
    const perFrame = slice?.enabled ? slice.batchSamplingArchetypesPerFrame : undefined;
    let toProcess: Iterable<any>;
    if (typeof perFrame === 'number' && Number.isFinite(perFrame)) {
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

      let entityIndicesBuf: Int32Array =
        entityIndicesScratchByArchetype.get(archetype.id) ?? new Int32Array(64);
      if (!entityIndicesScratchByArchetype.has(archetype.id)) {
        entityIndicesScratchByArchetype.set(archetype.id, entityIndicesBuf);
      }
      let entityCount = 0;

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

        if (
          (springBuffer && (springBuffer as any)[i]) ||
          (inertiaBuffer && (inertiaBuffer as any)[i])
        ) {
          continue;
        }

        // Only include running animations
        const status = typedStatus
          ? (typedStatus[i] as unknown as MotionStatus)
          : ((stateBuffer[i] as any).status as MotionStatus);
        if (status !== MotionStatus.Running) {
          continue;
        }

        if (status === MotionStatus.Running) {
          const interval = typedTickInterval
            ? typedTickInterval[i]
            : Number((stateBuffer[i] as any).tickInterval ?? 0);
          if (interval > 1) {
            const phase = typedTickPhase
              ? typedTickPhase[i]
              : Number((stateBuffer[i] as any).tickPhase ?? 0);
            if ((tickFrame + phase) % interval !== 0) {
              continue;
            }
          }
        }

        if (entityCount >= entityIndicesBuf.length) {
          const nextBuf: Int32Array = new Int32Array(entityIndicesBuf.length * 2);
          nextBuf.set(entityIndicesBuf);
          entityIndicesBuf = nextBuf;
          entityIndicesScratchByArchetype.set(archetype.id, entityIndicesBuf);
        }
        entityIndicesBuf[entityCount] = i;
        entityCount++;
      }

      // Create per-archetype batch if entities exist
      if (entityCount > 0) {
        const lease = processor.acquireEntityIds(entityCount);
        const entityIdsView = lease.buffer.subarray(0, entityCount);
        for (let eIndex = 0; eIndex < entityCount; eIndex++) {
          entityIdsView[eIndex] = archetype.getEntityId(entityIndicesBuf[eIndex]);
        }
        const statesData = bufferCache.getStatesBuffer(archetype.id, entityCount * 4);
        let runningCount = 0;
        let pausedCount = 0;
        for (let eIndex = 0; eIndex < entityCount; eIndex++) {
          const i = entityIndicesBuf[eIndex];
          const stateObj = stateBuffer[i] as any;
          const status = typedStatus
            ? (typedStatus[i] as unknown as MotionStatus)
            : (stateObj.status as MotionStatus);
          if (status === MotionStatus.Running) {
            runningCount++;
          } else if (status === MotionStatus.Paused) {
            pausedCount++;
          }
          const offset = eIndex * 4;
          statesData[offset] = typedStartTime ? typedStartTime[i] : Number(stateObj.startTime ?? 0);
          let currentTime = typedCurrentTime
            ? typedCurrentTime[i]
            : Number(stateObj.currentTime ?? 0);
          const timeline = timelineBuffer[i] as {
            duration?: number;
            repeat?: number;
            loop?: boolean;
          };
          const duration = Number(timeline?.duration ?? 0);
          const hasSpring = !!(springBuffer && (springBuffer as any)[i]);
          if (!hasSpring && duration > 0 && currentTime >= duration) {
            const maxRepeat = timeline?.repeat ?? (timeline?.loop ? -1 : 0);
            const iteration = typedIteration ? typedIteration[i] : Number(stateObj.iteration ?? 0);
            if (maxRepeat === -1 || iteration < maxRepeat) {
              currentTime = currentTime % duration;
            } else {
              currentTime = duration;
            }
          }
          statesData[offset + 1] = currentTime;
          statesData[offset + 2] = typedPlaybackRate
            ? typedPlaybackRate[i]
            : Number(stateObj.playbackRate ?? 0);
          statesData[offset + 3] = status;
        }

        let keyframesData: Float32Array;
        let preprocessedRawKeyframesPerEntity: Float32Array[] | undefined;
        let preprocessedChannelMapPerEntity: Uint32Array[] | undefined;

        if (preprocessEnabled && channelCount > 0) {
          preprocessedRawKeyframesPerEntity = new Array(entityCount);
          preprocessedChannelMapPerEntity = new Array(entityCount);
          for (let eIndex = 0; eIndex < entityCount; eIndex++) {
            const i = entityIndicesBuf[eIndex];
            const timeline = timelineBuffer[i] as { tracks?: TimelineData };
            const tracks = timeline.tracks as TimelineData | undefined;
            if (!tracks || tracks.size === 0) {
              preprocessedRawKeyframesPerEntity[eIndex] = new Float32Array(0);
              preprocessedChannelMapPerEntity[eIndex] = new Uint32Array(0);
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
              const truncated = track.slice(0, MAX_KEYFRAMES_PER_CHANNEL);
              const converted = truncated.map((kf) => ({
                startTime: kf.startTime,
                time: kf.time,
                startValue: kf.startValue,
                endValue: kf.endValue,
                easing: kf.easing,
              }));
              channelTracks.push({ property: prop, track: converted });
            }
            if (channelTracks.length === 0) {
              preprocessedRawKeyframesPerEntity[eIndex] = new Float32Array(0);
              preprocessedChannelMapPerEntity[eIndex] = new Uint32Array(0);
              continue;
            }
            const { rawKeyframes, channelMaps } = preprocessChannelsToRawAndMap(
              channelTracks,
              preprocessOptions,
              evaluateRawValue,
            );
            preprocessedRawKeyframesPerEntity[eIndex] = packRawKeyframes(rawKeyframes);
            preprocessedChannelMapPerEntity[eIndex] = packChannelMaps(channelMaps);
          }
        }

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
            : Number((timelineBuffer[i] as any).version ?? 0);
          versionSig = (((versionSig * 31) >>> 0) ^ (v >>> 0)) >>> 0;
        }
        const entitySig = hashEntityIndices(entityIndicesBuf, entityCount);
        versionSig = (((versionSig * 31) >>> 0) ^ (entitySig >>> 0)) >>> 0;
        versionSig = (((versionSig * 31) >>> 0) ^ (channelCount >>> 0)) >>> 0;

        if (channelCount > 0) {
          const required = entityCount * channelCount * MAX_KEYFRAMES_PER_CHANNEL * KEYFRAME_FLOATS;
          const cached = keyframesPackedCache.get(archetype.id);
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
                    const kf = track[kIndex] as Keyframe & {
                      bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
                    };
                    const easingId = config.gpuEasing === false ? 0 : getEasingId(kf.easing);

                    // Determine easing mode (Phase 1.1: Bezier support)
                    let easingMode = EASING_MODE_STANDARD;
                    if (kf.interp === 'hold') {
                      easingMode = EASING_MODE_HOLD;
                    } else if (kf.bezier || kf.interp === 'bezier') {
                      easingMode = EASING_MODE_BEZIER;
                    }

                    keyframesData[globalIndex] = kf.startTime;
                    const dur = kf.time - kf.startTime;
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

            keyframesPackedCache.set(archetype.id, {
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
            const tracks = timeline.tracks as TimelineData | undefined;
            if (!tracks || tracks.size === 0) continue;
            for (const [, track] of tracks) {
              if (Array.isArray(track)) totalKeyframes += track.length;
            }
          }

          const size = Math.max(KEYFRAME_FLOATS, totalKeyframes * KEYFRAME_FLOATS);
          const cached = keyframesPackedCache.get(archetype.id);
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
              const tracks = timeline.tracks as TimelineData | undefined;
              if (!tracks || tracks.size === 0) continue;
              for (const [, track] of tracks) {
                if (!Array.isArray(track) || track.length === 0) continue;
                for (let kIndex = 0; kIndex < track.length; kIndex++) {
                  const kf = track[kIndex] as Keyframe & {
                    bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
                  };
                  const easingId = config.gpuEasing === false ? 0 : getEasingId(kf.easing);

                  // Determine easing mode (Phase 1.1: Bezier support)
                  let easingMode = EASING_MODE_STANDARD;
                  if (kf.interp === 'hold') {
                    easingMode = EASING_MODE_HOLD;
                  } else if (kf.bezier || kf.interp === 'bezier') {
                    easingMode = EASING_MODE_BEZIER;
                  }

                  keyframesData[w] = kf.startTime;
                  const dur = kf.time - kf.startTime;
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
            for (; w < size; w++) {
              keyframesData[w] = 0;
            }
            keyframesPackedCache.set(archetype.id, {
              versionSig,
              entitySig,
              channelCount: 0,
              buffer: keyframesData,
            });
          }
        }

        const preprocessed =
          preprocessEnabled &&
          channelCount > 0 &&
          preprocessedRawKeyframesPerEntity &&
          preprocessedChannelMapPerEntity
            ? {
                rawKeyframesPerEntity: preprocessedRawKeyframesPerEntity,
                channelMapPerEntity: preprocessedChannelMapPerEntity,
              }
            : undefined;

        // Add per-archetype batch with adaptive workgroup hint
        // P0-2: Pass keyframes version signature for fast change detection
        const batch = processor.addArchetypeBatch(
          archetype.id,
          entityIdsView,
          entityCount,
          lease.leaseId,
          statesData,
          keyframesData,
          versionSig, // P0-2: Version signature for O(1) change detection
          preprocessed,
        );

        totalEntities += batch.entityCount;
      }

      if (!gpuActive) {
        continue;
      }

      if (!springBuffer && !inertiaBuffer) {
        continue;
      }

      let physicsChannels: Array<{ index: number; property: string }> = rawChannels;
      if (!physicsChannels || physicsChannels.length === 0) {
        const keys = new Set<string>();
        for (let i = 0; i < archetype.entityCount; i++) {
          const hasPhysics =
            !!(springBuffer && (springBuffer as any)[i]) ||
            !!(inertiaBuffer && (inertiaBuffer as any)[i]);
          if (!hasPhysics) continue;
          const status = typedStatus
            ? (typedStatus[i] as unknown as MotionStatus)
            : ((stateBuffer[i] as any).status as MotionStatus);
          if (status !== MotionStatus.Running) continue;
          const timeline = timelineBuffer[i] as any;
          const tracks = timeline?.tracks as Map<string, any> | undefined;
          if (!tracks || typeof tracks.keys !== 'function') continue;
          for (const k of tracks.keys()) {
            keys.add(String(k));
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
      let physicsIndicesBuf: Int32Array =
        entityIndicesScratchByArchetype.get(physicsArchetypeId) ?? new Int32Array(64);
      if (!entityIndicesScratchByArchetype.has(physicsArchetypeId)) {
        entityIndicesScratchByArchetype.set(physicsArchetypeId, physicsIndicesBuf);
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
          !!(springBuffer && (springBuffer as any)[i]) ||
          !!(inertiaBuffer && (inertiaBuffer as any)[i]);
        if (!hasPhysics) continue;

        const status = typedStatus
          ? (typedStatus[i] as unknown as MotionStatus)
          : ((stateBuffer[i] as any).status as MotionStatus);
        if (status !== MotionStatus.Running) continue;

        const interval = typedTickInterval
          ? typedTickInterval[i]
          : Number((stateBuffer[i] as any).tickInterval ?? 0);
        if (interval > 1) {
          const phase = typedTickPhase
            ? typedTickPhase[i]
            : Number((stateBuffer[i] as any).tickPhase ?? 0);
          if ((tickFrame + phase) % interval !== 0) {
            continue;
          }
        }

        if (physicsEntityCount >= physicsIndicesBuf.length) {
          const nextBuf: Int32Array = new Int32Array(physicsIndicesBuf.length * 2);
          nextBuf.set(physicsIndicesBuf);
          physicsIndicesBuf = nextBuf;
          entityIndicesScratchByArchetype.set(physicsArchetypeId, physicsIndicesBuf);
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
        if (!needsUpload) {
          if ((id >= 0 && !isPhysicsGPUEntity(id)) || forcedSync.has(id)) {
            needsUpload = true;
          }
        }
      }

      const layoutSig =
        (hashEntityIndices(physicsIndicesBuf, physicsEntityCount) ^
          (physicsStride * 2654435761)) >>>
        0;
      const prevLayoutSig = physicsLayoutSigByArchetype.get(physicsArchetypeId);
      if (prevLayoutSig !== layoutSig) {
        needsUpload = true;
        physicsLayoutSigByArchetype.set(physicsArchetypeId, layoutSig);
      }

      let stateData: Float32Array | undefined;
      let stateVersion = physicsStateVersionByArchetype.get(physicsArchetypeId) ?? 0;
      const slotCount = physicsEntityCount * physicsStride;
      if (needsUpload) {
        stateVersion = (stateVersion + 1) >>> 0;
        physicsStateVersionByArchetype.set(physicsArchetypeId, stateVersion);

        stateData = new Float32Array(slotCount * PHYSICS_STATE_STRIDE);
        const typedTransformByProp: Record<
          string,
          Float32Array | Float64Array | Int32Array | undefined
        > = {};
        for (let cIndex = 0; cIndex < physicsStride; cIndex++) {
          const prop = physicsChannels[cIndex].property;
          typedTransformByProp[prop] = archetype.getTypedBuffer?.('Transform', prop) as any;
        }

        for (let eIndex = 0; eIndex < physicsEntityCount; eIndex++) {
          const i = physicsIndicesBuf[eIndex];
          const timeline = timelineBuffer[i] as any;
          const tracks = (timeline?.tracks as Map<string, Track> | undefined) ?? undefined;
          const spring = springBuffer ? (springBuffer as any)[i] : undefined;
          const inertia = inertiaBuffer ? (inertiaBuffer as any)[i] : undefined;
          const render = renderBuffer[i] as any;
          const transform = transformBuffer ? (transformBuffer[i] as any) : undefined;

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
            const target = first ? Number((first as any).endValue ?? position) : position;
            const fromValue = first ? Number((first as any).startValue ?? position) : position;

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
        lastBatchId: `batch-${Math.floor(now / 1000)}`,
        entityCount: totalEntities,
        archetypeBatchesReady: true,
      });
    }

    // P1-2: Advance frame counter for cache cleanup
    getArchetypeBufferCache().nextFrame();
  },
};
