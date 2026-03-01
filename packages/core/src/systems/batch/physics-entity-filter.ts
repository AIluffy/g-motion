/**
 * Physics Entity Filter
 *
 * Filters archetype entities that should participate in the physics GPU batch.
 * Mirror of entity-filter.ts but includes physics entities and excludes
 * keyframe-animation-only entities.
 *
 * Inclusion criteria:
 *   1. Has a Spring or Inertia component (must have at least one)
 *   2. MotionStatus = Running
 *   3. Not a callback-renderer entity
 *   4. Tick-interval phase aligned to current tickFrame
 */

import type { MotionStateData } from '@g-motion/shared';
import { MotionStatus } from '../../components/state';
import { getRendererCode } from '../../renderer-code';
import { getEntityIndicesScratchByArchetype } from './utils';

export interface PhysicsFilterInput {
  /** Composite key, e.g. `${archetypeId}::physics` */
  physicsArchetypeId: string;
  entityCount: number;
  stateBuffer: Array<unknown>;
  renderBuffer: Array<unknown>;
  springBuffer: Array<unknown>;
  inertiaBuffer: Array<unknown>;
  typedStatus: Float32Array | Float64Array | Int32Array | undefined;
  typedRendererCode: Float32Array | Float64Array | Int32Array | undefined;
  typedTickInterval: Float32Array | Float64Array | Int32Array | undefined;
  typedTickPhase: Float32Array | Float64Array | Int32Array | undefined;
  tickFrame: number;
}

export interface PhysicsFilterResult {
  physicsIndicesBuf: Int32Array;
  physicsEntityCount: number;
}

const callbackCode = getRendererCode('callback');

/**
 * Return the archetype-local indices of entities eligible for physics GPU dispatch.
 * The returned buffer is a scratch buffer; callers must not hold it across frames.
 */
export function filterPhysicsEntities(input: PhysicsFilterInput): PhysicsFilterResult {
  const {
    physicsArchetypeId,
    entityCount,
    stateBuffer,
    renderBuffer,
    springBuffer,
    inertiaBuffer,
    typedStatus,
    typedRendererCode,
    typedTickInterval,
    typedTickPhase,
    tickFrame,
  } = input;

  const scratchMap = getEntityIndicesScratchByArchetype();
  let buf: Int32Array = scratchMap.get(physicsArchetypeId) ?? new Int32Array(64);
  if (!scratchMap.has(physicsArchetypeId)) scratchMap.set(physicsArchetypeId, buf);

  let count = 0;

  for (let i = 0; i < entityCount; i++) {
    // Callback-renderer exclusion
    let rendererCode = typedRendererCode ? typedRendererCode[i] : 0;
    if (!typedRendererCode) {
      const render = renderBuffer[i] as { rendererId?: string; rendererCode?: number };
      rendererCode = render.rendererCode ?? 0;
      if (render.rendererId === 'callback') continue;
    }
    if (rendererCode === callbackCode) continue;

    // Must have physics component
    const hasPhysics = !!(springBuffer[i] != null) || !!(inertiaBuffer[i] != null);
    if (!hasPhysics) continue;

    // MotionStatus must be Running
    const stateObj = stateBuffer[i] as MotionStateData;
    const status = typedStatus
      ? (typedStatus[i] as unknown as MotionStatus)
      : (stateObj.status as unknown as MotionStatus);
    if (status !== MotionStatus.Running) continue;

    // Tick-interval throttling
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
      scratchMap.set(physicsArchetypeId, buf);
    }
    buf[count++] = i;
  }

  return { physicsIndicesBuf: buf, physicsEntityCount: count };
}

/**
 * Fill `entityIdsView` array with entity IDs from `physicsIndicesBuf` and determine
 * whether a GPU state upload is needed (new entity, forced sync, or first physics frame).
 */
export function fillPhysicsEntityIds(
  physicsIndicesBuf: Int32Array,
  physicsEntityCount: number,
  getEntityId: (idx: number) => number,
  forcedSync: Set<number>,
  isPhysicsGPUEntity: (id: number) => boolean,
  entityIdsView: Int32Array,
): boolean {
  let needsUpload = false;
  for (let ei = 0; ei < physicsEntityCount; ei++) {
    const id = getEntityId(physicsIndicesBuf[ei]);
    entityIdsView[ei] = id;
    if (!needsUpload && (forcedSync.has(id) || (id >= 0 && !isPhysicsGPUEntity(id)))) {
      needsUpload = true;
    }
  }
  return needsUpload;
}
