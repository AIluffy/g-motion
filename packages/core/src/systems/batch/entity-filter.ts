/**
 * Entity Filter
 *
 * Responsibility: Filter entities within an archetype that are eligible for GPU batch
 * processing. Handles four exclusion criteria:
 *   1. Callback-renderer entities (rendererCode === callbackCode)
 *   2. Physics entities (Spring / Inertia components present on the slot)
 *   3. Entities whose MotionStatus is not Running
 *   4. Entities with an invalid currentTime value
 *   5. Tick-interval throttling (skip frames not aligned to the entity's phase)
 */

import type { MotionStateData } from '@g-motion/shared';
import { MotionStatus } from '../../components/state';
import { getRendererCode } from '../../render/renderer-code';
import { getEntityIndicesScratchByArchetype } from './utils';

/** Result produced by {@link filterEntitiesForGPU}. */
export interface FilteredEntityResult {
  /** Scratch buffer holding the archetype-local indices of eligible entities. */
  entityIndicesBuf: Int32Array;
  /** Number of valid entries at the front of {@link entityIndicesBuf}. */
  entityCount: number;
}

/** Inputs required to run entity filtering for one archetype. */
export interface EntityFilterInput {
  archetypeId: string;
  entityCount: number;
  /** Raw component buffers (AoS). */
  stateBuffer: Array<unknown>;
  renderBuffer: Array<unknown>;
  springBuffer: Array<unknown> | undefined;
  inertiaBuffer: Array<unknown> | undefined;
  /** Typed (SoA) views – may be undefined when archetype uses AoS layout. */
  typedStatus: Float32Array | Float64Array | Int32Array | undefined;
  typedCurrentTime: Float32Array | Float64Array | Int32Array | undefined;
  typedRendererCode: Float32Array | Float64Array | Int32Array | undefined;
  typedTickInterval: Float32Array | Float64Array | Int32Array | undefined;
  typedTickPhase: Float32Array | Float64Array | Int32Array | undefined;
  /** Frame counter used for tick-interval phase alignment. */
  tickFrame: number;
}

const callbackCode = getRendererCode('callback');

/**
 * Filter entities in one archetype that are ready for GPU animation sampling.
 *
 * The returned {@link FilteredEntityResult} reuses a scratch buffer stored in
 * the module-level map, so callers must not hold references across frames.
 */
export function filterEntitiesForGPU(input: EntityFilterInput): FilteredEntityResult {
  const {
    archetypeId,
    entityCount,
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
  } = input;

  const scratchMap = getEntityIndicesScratchByArchetype();
  let buf: Int32Array = scratchMap.get(archetypeId) ?? new Int32Array(64);
  if (!scratchMap.has(archetypeId)) scratchMap.set(archetypeId, buf);

  let count = 0;

  for (let i = 0; i < entityCount; i++) {
    // 1. Exclude callback-renderer entities
    let rendererCode = typedRendererCode ? typedRendererCode[i] : 0;
    if (!typedRendererCode) {
      const render = renderBuffer[i] as { rendererId?: string; rendererCode?: number };
      rendererCode = render.rendererCode ?? 0;
      if (render.rendererId === 'callback') continue;
    }
    if (rendererCode === callbackCode) continue;

    // 2. Exclude physics entities (handled by physics-assembler)
    const hasPhysics =
      !!(springBuffer && springBuffer[i] != null) || !!(inertiaBuffer && inertiaBuffer[i] != null);
    if (hasPhysics) continue;

    // 3. MotionStatus must be Running
    const stateObj = stateBuffer[i] as MotionStateData;
    const status = typedStatus
      ? (typedStatus[i] as unknown as MotionStatus)
      : (stateObj.status as unknown as MotionStatus);
    if (status !== MotionStatus.Running) continue;

    // 4. currentTime must be a valid non-negative finite number
    const timelineTime = typedCurrentTime
      ? (typedCurrentTime[i] as unknown as number)
      : Number(stateObj.currentTime ?? 0);
    if (!(Number.isFinite(timelineTime) && timelineTime >= 0)) continue;

    // 5. Tick-interval throttling
    const interval = typedTickInterval ? typedTickInterval[i] : Number(stateObj.tickInterval ?? 0);
    if (interval > 1) {
      const phase = typedTickPhase ? typedTickPhase[i] : Number(stateObj.tickPhase ?? 0);
      if ((tickFrame + phase) % interval !== 0) continue;
    }

    // Grow scratch buffer on demand
    if (count >= buf.length) {
      const next = new Int32Array(buf.length * 2);
      next.set(buf);
      buf = next;
      scratchMap.set(archetypeId, buf);
    }
    buf[count++] = i;
  }

  return { entityIndicesBuf: buf, entityCount: count };
}
