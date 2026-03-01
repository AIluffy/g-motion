/**
 * Batch Builder
 *
 * Responsibility: Build or update a single per-archetype keyframe animation batch
 * descriptor.  Consolidates the entity-ID acquisition, state packing, keyframe
 * serialization, and cache-reuse decisions that were previously inline in the
 * BatchSamplingSystem loop.
 *
 * Depends on: state-packer, keyframe-serializer, batch-cache.
 */

import type { PreprocessedKeyframes, TimelineComponentData } from '@g-motion/shared';
import type { RawKeyframeGenerationOptions, RawKeyframeValueEvaluator } from '@g-motion/webgpu';
import { canReuseBatch, canReusePreprocessed, computeBatchVersionHash } from './batch-cache';
import { serializeKeyframes } from './keyframe-serializer';
import { packEntityStates } from './state-packer';

type TypedBuf = Float32Array | Float64Array | Int32Array | undefined;
type MutableBatch = {
  entityIds: ArrayLike<number>;
  entityIdsLeaseId?: number;
  statesData: Float32Array;
  keyframesData: Float32Array;
  statesVersion?: number;
  keyframesVersion?: number;
  entitySig?: number;
  entityCount: number;
  createdAt?: number;
  preprocessedKeyframes?: PreprocessedKeyframes;
};

export interface BuildBatchInput {
  archetypeId: string;
  entityIndicesBuf: Int32Array;
  entityCount: number;
  stateBuffer: Array<unknown>;
  timelineBuffer: Array<unknown>;
  rawChannels: Array<{ index: number; property: string }>;
  channelCount: number;
  typedStatus: TypedBuf;
  typedStartTime: TypedBuf;
  typedCurrentTime: TypedBuf;
  typedPlaybackRate: TypedBuf;
  typedTimelineVersion: TypedBuf;
  preprocessEnabled: boolean;
  timelineFlatEnabled: boolean;
  preprocessOptions: RawKeyframeGenerationOptions;
  evaluateRawValue: RawKeyframeValueEvaluator;
  staticReuseEnabled: boolean;
  seekInvalidation: boolean;
  prevBatch: (MutableBatch & { kind?: string }) | undefined;
  /** Acquire entity-ID lease from processor. */
  acquireEntityIds: (n: number) => { leaseId: number; buffer: Int32Array };
  /** Get entity ID by archetype-local index. */
  getEntityId: (idx: number) => number;
  /** Add a new batch descriptor. Returns mutable batch object. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addArchetypeBatch: (...args: any[]) => MutableBatch;
  /** Remove an existing batch. */
  removeArchetypeBatch: (id: string) => void;
}

/**
 * Build or update the batch descriptor for one archetype.
 * Mutates `prevBatch` in-place when keys/keyframes can be reused; otherwise
 * calls `addArchetypeBatch` to create a new descriptor.
 * Returns the final `{ statesVersion, entitySig }` for the caller to store.
 */
export function buildAnimationBatch(input: BuildBatchInput): void {
  const {
    archetypeId,
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
    typedTimelineVersion,
    preprocessEnabled,
    timelineFlatEnabled,
    preprocessOptions,
    evaluateRawValue,
    staticReuseEnabled,
    seekInvalidation,
    prevBatch,
    acquireEntityIds,
    getEntityId,
    addArchetypeBatch,
    removeArchetypeBatch,
  } = input;

  // Version hash
  const tlVersions = Array.from({ length: entityCount }, (_, ei) => {
    const i = entityIndicesBuf[ei];
    return typedTimelineVersion
      ? (typedTimelineVersion[i] as unknown as number)
      : Number((timelineBuffer[i] as TimelineComponentData).version ?? 0);
  });
  const entitySig = hashSimple(entityIndicesBuf, entityCount);
  const versionSig = computeBatchVersionHash(
    preprocessOptions,
    tlVersions,
    entitySig,
    channelCount,
  );
  const candidate = { entityCount, entitySig, keyframesVersionSig: versionSig };

  // Entity ID lease
  const reuseEnt =
    staticReuseEnabled &&
    !seekInvalidation &&
    prevBatch &&
    prevBatch.entityCount === entityCount &&
    prevBatch.entitySig === entitySig;
  let entityIds: ArrayLike<number>;
  let leaseId: number | undefined;
  let existingStatesBuf: Float32Array | undefined;
  if (reuseEnt) {
    entityIds = prevBatch!.entityIds;
    leaseId = prevBatch!.entityIdsLeaseId;
    existingStatesBuf = prevBatch!.statesData;
  } else {
    if (prevBatch) removeArchetypeBatch(archetypeId);
    const lease = acquireEntityIds(entityCount);
    leaseId = lease.leaseId;
    const view = lease.buffer.subarray(0, entityCount);
    for (let ei = 0; ei < entityCount; ei++) view[ei] = getEntityId(entityIndicesBuf[ei]);
    entityIds = view;
  }

  // State packing
  const { data: statesData, version: statesVersion } = packEntityStates({
    archetypeId,
    entityIndicesBuf,
    entityCount,
    stateBuffer,
    typedStatus,
    typedStartTime,
    typedCurrentTime,
    typedPlaybackRate,
    existingBuffer: existingStatesBuf,
  });

  // Keyframe serialization
  const reusePP = canReusePreprocessed(
    prevBatch as Parameters<typeof canReusePreprocessed>[0],
    candidate,
    staticReuseEnabled,
    seekInvalidation,
    preprocessEnabled,
    channelCount,
  );
  const reuseKf = canReuseBatch(
    prevBatch as Parameters<typeof canReuseBatch>[0],
    candidate,
    staticReuseEnabled,
    seekInvalidation,
  );

  let preprocessed: PreprocessedKeyframes | undefined = reusePP
    ? prevBatch!.preprocessedKeyframes
    : undefined;
  let keyframesData: Float32Array;
  if (reuseKf) {
    keyframesData = prevBatch!.keyframesData;
  } else {
    const ser = serializeKeyframes({
      archetypeId,
      entityIndicesBuf,
      entityCount,
      timelineBuffer,
      rawChannels,
      channelCount,
      versionSig,
      entitySig,
      preprocessEnabled,
      timelineFlatEnabled,
      preprocessOptions,
      evaluateRawValue,
    });
    keyframesData = ser.keyframesData;
    if (!reusePP) preprocessed = ser.preprocessed;
  }

  // Commit
  if (reuseKf && prevBatch) {
    prevBatch.statesVersion = statesVersion;
    prevBatch.createdAt = Date.now();
    prevBatch.statesData = statesData;
    prevBatch.keyframesData = keyframesData;
    prevBatch.keyframesVersion = versionSig;
    prevBatch.entitySig = entitySig;
    if (preprocessed) prevBatch.preprocessedKeyframes = preprocessed;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = addArchetypeBatch(
      archetypeId,
      entityIds,
      entityCount,
      leaseId,
      statesData,
      keyframesData,
      versionSig,
      preprocessed,
    ) as any as MutableBatch;
    b.statesVersion = statesVersion;
    b.entitySig = entitySig;
  }
}

/** FNV-1a entity-indices hash (mirrors hashEntityIndices in utils.ts). */
function hashSimple(buf: Int32Array, len: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < len; i++) {
    h ^= buf[i] >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}
