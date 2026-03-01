/**
 * Archetype Buffers
 *
 * Responsibility: Resolve per-archetype AoS / SoA component buffers, using the
 * {@link ArchetypeBufferCache} to avoid redundant Map lookups each frame.
 *
 * This helper is consumed by BatchSamplingSystem so that buffer resolution
 * is a single function call rather than 15+ lines of cache-miss/hit logic.
 */

import type { Archetype } from '../../archetype';
import { getArchetypeBufferCache } from './archetype-buffer-cache';

export interface ResolvedArchetypeBuffers {
  stateBuffer: Array<unknown>;
  timelineBuffer: Array<unknown>;
  renderBuffer: Array<unknown>;
  springBuffer: Array<unknown> | undefined;
  inertiaBuffer: Array<unknown> | undefined;
  typedStatus: Float32Array | Float64Array | Int32Array | undefined;
  typedStartTime: Float32Array | Float64Array | Int32Array | undefined;
  typedCurrentTime: Float32Array | Float64Array | Int32Array | undefined;
  typedPlaybackRate: Float32Array | Float64Array | Int32Array | undefined;
  typedTickInterval: Float32Array | Float64Array | Int32Array | undefined;
  typedTickPhase: Float32Array | Float64Array | Int32Array | undefined;
  typedRendererCode: Float32Array | Float64Array | Int32Array | undefined;
}

/**
 * Return the AoS and SoA buffers for an archetype, using the frame-level cache.
 * Returns `undefined` when the archetype is missing required animation components
 * (MotionState, Timeline, Render) and should be skipped.
 */
export function resolveArchetypeBuffers(
  archetype: Archetype,
): ResolvedArchetypeBuffers | undefined {
  const cache = getArchetypeBufferCache();
  const hit = cache.getBuffers(archetype);

  if (hit) {
    if (!hit.stateBuffer || !hit.timelineBuffer || !hit.renderBuffer) return undefined;
    return {
      stateBuffer: hit.stateBuffer,
      timelineBuffer: hit.timelineBuffer,
      renderBuffer: hit.renderBuffer,
      springBuffer: hit.springBuffer,
      inertiaBuffer: hit.inertiaBuffer,
      typedStatus: hit.typedStatus,
      typedStartTime: hit.typedStartTime,
      typedCurrentTime: hit.typedCurrentTime,
      typedPlaybackRate: hit.typedPlaybackRate,
      typedTickInterval: hit.typedTickInterval,
      typedTickPhase: hit.typedTickPhase,
      typedRendererCode: hit.typedRendererCode,
    };
  }

  // Cache miss – fetch fresh
  const stateBuffer = archetype.getBuffer('MotionState');
  const timelineBuffer = archetype.getBuffer('Timeline');
  const renderBuffer = archetype.getBuffer('Render');
  if (!stateBuffer || !timelineBuffer || !renderBuffer) return undefined;

  const springBuffer = archetype.getBuffer?.('Spring');
  const inertiaBuffer = archetype.getBuffer?.('Inertia');
  const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
  const typedStartTime = archetype.getTypedBuffer('MotionState', 'startTime');
  const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
  const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
  const typedTickInterval = archetype.getTypedBuffer('MotionState', 'tickInterval');
  const typedTickPhase = archetype.getTypedBuffer('MotionState', 'tickPhase');
  const typedRendererCode = archetype.getTypedBuffer('Render', 'rendererCode');

  cache.setBuffers(archetype, {
    stateBuffer,
    timelineBuffer,
    renderBuffer,
    springBuffer,
    inertiaBuffer,
    typedStatus,
    typedStartTime,
    typedPausedAt: archetype.getTypedBuffer('MotionState', 'pausedAt'),
    typedDelay: archetype.getTypedBuffer('MotionState', 'delay'),
    typedCurrentTime,
    typedPlaybackRate,
    typedIteration: archetype.getTypedBuffer('MotionState', 'iteration'),
    typedTickInterval,
    typedTickPhase,
    typedRendererCode,
    typedTimelineVersion: archetype.getTypedBuffer('Timeline', 'version'),
  });

  return {
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
  };
}
