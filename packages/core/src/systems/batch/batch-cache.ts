/**
 * Batch Cache
 *
 * Responsibility: Version hash computation and batch cache reuse decisions.
 *
 * The version hash (`versionSig`) is an FNV-1a derived fingerprint that encodes:
 *   - Preprocessing options (timeInterval, maxSubdivisions)
 *   - Per-entity timeline version numbers
 *   - Entity index signature (which entities are in the batch)
 *   - Channel count (layout changes invalidate the cache)
 *
 * `canReuseBatch` compares the current frame's fingerprints against a previously
 * created batch descriptor and returns `true` when the GPU buffers can be reused
 * without re-serialisation.
 */

import type { PreprocessedKeyframes } from '@g-motion/shared';
import type { GPUBatchDescriptor, RawKeyframeGenerationOptions } from '../../runtime/gpu-types';

// ---------------------------------------------------------------------------
// Version hash
// ---------------------------------------------------------------------------

/**
 * Compute the keyframe version signature for one archetype batch.
 *
 * The hash is deterministic given the same inputs in the same order, so it can
 * be used as a cheap "dirty" check before re-serialising keyframe data.
 *
 * @param preprocessOptions  Preprocessing config (timeInterval, maxSubdivisionsPerSegment).
 * @param timelineVersions   Per-entity timeline version numbers, indexed by batch position.
 * @param entitySig          Hash of the entity-index array (from {@link hashEntityIndices}).
 * @param channelCount       Number of animation channels in this archetype.
 * @returns A 32-bit unsigned integer hash.
 */
export function computeBatchVersionHash(
  preprocessOptions: Pick<
    RawKeyframeGenerationOptions,
    'timeInterval' | 'maxSubdivisionsPerSegment'
  >,
  timelineVersions: ArrayLike<number>,
  entitySig: number,
  channelCount: number,
): number {
  // Mix in preprocessing options
  const optionsSig =
    ((((preprocessOptions.timeInterval ?? 0) as number) | 0) * 31 +
      (((preprocessOptions.maxSubdivisionsPerSegment ?? 0) as number) | 0)) >>>
    0;

  let h = (2166136261 >>> 0) ^ (optionsSig >>> 0);
  h = Math.imul(h, 16777619) >>> 0;

  // Mix in per-entity timeline versions
  for (let eIndex = 0; eIndex < timelineVersions.length; eIndex++) {
    h = ((h * 31) >>> 0) ^ (timelineVersions[eIndex] >>> 0);
    h = h >>> 0;
  }

  // Mix in structural identifiers
  h = ((h * 31) >>> 0) ^ (entitySig >>> 0);
  h = ((h * 31) >>> 0) ^ (channelCount >>> 0);
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Reuse decision
// ---------------------------------------------------------------------------

/**
 * Snapshot of the current frame's batch fingerprints used for reuse checks.
 */
export interface BatchCandidateInfo {
  entityCount: number;
  entitySig: number;
  keyframesVersionSig: number;
  hasPreprocessedKeyframes?: boolean;
}

/**
 * Determine whether the existing `prevBatch` GPU buffers can be reused.
 *
 * @param prevBatch       The previously dispatched batch descriptor, or `undefined`.
 * @param candidate       Current-frame fingerprints.
 * @param staticReuseEnabled  Config flag that enables the static-reuse optimisation.
 * @param seekInvalidation    `true` when a seek has occurred this frame.
 * @returns `true` when the batch can be reused without re-upload.
 */
export function canReuseBatch(
  prevBatch: (GPUBatchDescriptor & { entitySig?: number; kind?: string }) | undefined,
  candidate: BatchCandidateInfo,
  staticReuseEnabled: boolean,
  seekInvalidation: boolean,
): boolean {
  if (!staticReuseEnabled || seekInvalidation || !prevBatch) return false;
  if ((prevBatch as { kind?: string }).kind === 'physics') return false;

  return (
    prevBatch.entityCount === candidate.entityCount &&
    prevBatch.entitySig === candidate.entitySig &&
    prevBatch.keyframesVersion === candidate.keyframesVersionSig
  );
}

/**
 * Determine whether only the preprocessed keyframe data can be reused
 * (implies {@link canReuseBatch} is also `true`).
 */
export function canReusePreprocessed(
  prevBatch:
    | (GPUBatchDescriptor & { entitySig?: number; preprocessedKeyframes?: PreprocessedKeyframes })
    | undefined,
  candidate: BatchCandidateInfo,
  staticReuseEnabled: boolean,
  seekInvalidation: boolean,
  preprocessEnabled: boolean,
  channelCount: number,
): boolean {
  if (!preprocessEnabled || channelCount === 0) return false;
  if (
    !canReuseBatch(
      prevBatch as Parameters<typeof canReuseBatch>[0],
      candidate,
      staticReuseEnabled,
      seekInvalidation,
    )
  )
    return false;
  return !!prevBatch?.preprocessedKeyframes;
}
