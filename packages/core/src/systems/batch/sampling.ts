import type { SystemContext } from '../../plugin';
import { SystemDef } from '../../plugin';
import { MotionStatus } from '../../components/state';
import { getEasingId } from '../easing-registry';
import { BatchBufferCache } from './buffer-cache';
import { getGPUChannelMappingRegistry } from '../../webgpu/channel-mapping';
import type { TimelineData, Track, Keyframe } from '../../types';
import { getRendererCode } from '../../renderer-code';
import { getArchetypeBufferCache } from './archetype-buffer-cache'; // P1-2: Buffer cache
import { KEYFRAME_STRIDE } from '../../webgpu/shader'; // Phase 1.1: Extended keyframe support

// Easing mode constants (matching shader EASING_MODE)
const EASING_MODE_STANDARD = 0;
const EASING_MODE_BEZIER = 1;
const EASING_MODE_HOLD = 2;

const bufferCache = new BatchBufferCache();
const archetypeBufferCache = getArchetypeBufferCache(); // P1-2: Archetype-level cache
const MAX_KEYFRAMES_PER_CHANNEL = 4;

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
    const frame = frameId++;
    const config = world.config;
    const channelRegistry = getGPUChannelMappingRegistry();
    const callbackCode = getRendererCode('callback');

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
      let cachedBuffers = archetypeBufferCache.getBuffers(archetype);

      let stateBuffer: Array<unknown> | undefined;
      let timelineBuffer: Array<unknown> | undefined;
      let renderBuffer: Array<unknown> | undefined;
      let typedStatus: Float32Array | Float64Array | Int32Array | undefined;
      let typedStartTime: Float32Array | Float64Array | Int32Array | undefined;
      let typedCurrentTime: Float32Array | Float64Array | Int32Array | undefined;
      let typedPlaybackRate: Float32Array | Float64Array | Int32Array | undefined;
      let typedTickInterval: Float32Array | Float64Array | Int32Array | undefined;
      let typedTickPhase: Float32Array | Float64Array | Int32Array | undefined;
      let typedRendererCode: Float32Array | Float64Array | Int32Array | undefined;

      if (cachedBuffers) {
        // Cache hit: use cached buffers
        stateBuffer = cachedBuffers.stateBuffer;
        timelineBuffer = cachedBuffers.timelineBuffer;
        renderBuffer = cachedBuffers.renderBuffer;
        typedStatus = cachedBuffers.typedStatus;
        typedStartTime = cachedBuffers.typedStartTime;
        typedCurrentTime = cachedBuffers.typedCurrentTime;
        typedPlaybackRate = cachedBuffers.typedPlaybackRate;
        typedTickInterval = cachedBuffers.typedTickInterval;
        typedTickPhase = cachedBuffers.typedTickPhase;
        typedRendererCode = cachedBuffers.typedRendererCode;
      } else {
        // Cache miss: fetch buffers and cache them
        stateBuffer = archetype.getBuffer('MotionState');
        timelineBuffer = archetype.getBuffer('Timeline');
        renderBuffer = archetype.getBuffer('Render');
        typedStatus = archetype.getTypedBuffer('MotionState', 'status');
        typedStartTime = archetype.getTypedBuffer('MotionState', 'startTime');
        typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
        typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
        typedTickInterval = archetype.getTypedBuffer('MotionState', 'tickInterval');
        typedTickPhase = archetype.getTypedBuffer('MotionState', 'tickPhase');
        typedRendererCode = archetype.getTypedBuffer('Render', 'rendererCode');

        // Store in cache for next frame
        archetypeBufferCache.setBuffers(archetype, {
          stateBuffer,
          timelineBuffer,
          renderBuffer,
          springBuffer: undefined,
          inertiaBuffer: undefined,
          typedStatus,
          typedStartTime,
          typedCurrentTime,
          typedPlaybackRate,
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
      const channels = table?.channels ?? [];
      const channelCount = channels.length;

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

        // Only include running/paused animations
        const status = typedStatus
          ? (typedStatus[i] as unknown as MotionStatus)
          : ((stateBuffer[i] as any).status as MotionStatus);
        if (status !== MotionStatus.Running && status !== MotionStatus.Paused) {
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
            if ((frame + phase) % interval !== 0) {
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
        // Pack entity states using cached buffer (eliminates per-frame allocation)
        const statesData = bufferCache.getStatesBuffer(archetype.id, entityCount * 4);
        for (let eIndex = 0; eIndex < entityCount; eIndex++) {
          const i = entityIndicesBuf[eIndex];
          const stateObj = stateBuffer[i] as any;
          const status = typedStatus
            ? (typedStatus[i] as unknown as MotionStatus)
            : (stateObj.status as MotionStatus);
          const offset = eIndex * 4;
          statesData[offset] = typedStartTime ? typedStartTime[i] : Number(stateObj.startTime ?? 0);
          statesData[offset + 1] = typedCurrentTime
            ? typedCurrentTime[i]
            : Number(stateObj.currentTime ?? 0);
          statesData[offset + 2] = typedPlaybackRate
            ? typedPlaybackRate[i]
            : Number(stateObj.playbackRate ?? 0);
          statesData[offset + 3] = status;
        }

        let keyframesData: Float32Array;

        // Build signatures for static-cache decision
        let versionSig = 0 >>> 0;
        const typedTimelineVersion = archetype.getTypedBuffer('Timeline', 'version');
        for (let eIndex = 0; eIndex < entityCount; eIndex++) {
          const i = entityIndicesBuf[eIndex];
          const v = typedTimelineVersion
            ? (typedTimelineVersion[i] as unknown as number)
            : Number((timelineBuffer[i] as any).version ?? 0);
          versionSig = (((versionSig * 31) >>> 0) ^ (v >>> 0)) >>> 0;
        }
        const entitySig = hashEntityIndices(entityIndicesBuf, entityCount);

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
                const prop = channels[cIndex].property;
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
                      interpMode?: string;
                    };
                    const easingId = config.gpuEasing === false ? 0 : getEasingId(kf.easing);

                    // Determine easing mode (Phase 1.1: Bezier support)
                    let easingMode = EASING_MODE_STANDARD;
                    if (kf.interpMode === 'hold') {
                      easingMode = EASING_MODE_HOLD;
                    } else if (kf.bezier || kf.interpMode === 'bezier') {
                      easingMode = EASING_MODE_BEZIER;
                    }

                    keyframesData[globalIndex] = kf.startTime;
                    keyframesData[globalIndex + 1] = kf.time - kf.startTime;
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
                    interpMode?: string;
                  };
                  const easingId = config.gpuEasing === false ? 0 : getEasingId(kf.easing);

                  // Determine easing mode (Phase 1.1: Bezier support)
                  let easingMode = EASING_MODE_STANDARD;
                  if (kf.interpMode === 'hold') {
                    easingMode = EASING_MODE_HOLD;
                  } else if (kf.bezier || kf.interpMode === 'bezier') {
                    easingMode = EASING_MODE_BEZIER;
                  }

                  keyframesData[w] = kf.startTime;
                  keyframesData[w + 1] = kf.time - kf.startTime;
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
        );

        totalEntities += batch.entityCount;
      }
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
    archetypeBufferCache.nextFrame();
  },
};
