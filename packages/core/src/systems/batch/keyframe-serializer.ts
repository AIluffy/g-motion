/**
 * Keyframe Serializer – Coordinator
 *
 * Selects and delegates to one of three serialization paths based on the
 * archetype's channel layout and preprocessing configuration:
 *
 *   Path A (preprocessed)  → keyframe-path-preprocessed.ts
 *   Path B (flat channel)  → keyframe-path-flat.ts
 *   Path C (non-flat)      → keyframe-path-nonflat.ts
 *
 * All three paths share low-level helpers from keyframe-utils.ts.
 *
 * Public contract:
 *   serializeKeyframes(input) → { keyframesData, preprocessed }
 */

import { getKeyframesPackedCache } from './utils';
import { serializePreprocessedPath } from './keyframe-path-preprocessed';
import { serializeFlatChannelPath } from './keyframe-path-flat';
import { serializeNonFlatPath } from './keyframe-path-nonflat';

// Re-export types so callers only need to import from this file
export type { KeyframeSerializerInput, SerializedKeyframes } from './keyframe-utils';

/**
 * Serialize keyframes for all entities in one archetype batch into a
 * GPU-uploadable Float32Array.
 *
 * Internally routes to one of three implementations:
 *   - preprocessEnabled && channelCount > 0  → clip-deduplicated preprocessed path
 *   - !preprocessEnabled && channelCount > 0 → dense fixed-stride flat path
 *   - channelCount === 0                     → sequential non-flat path
 *
 * Returns the packed buffer and an optional {@link PreprocessedKeyframes} model.
 * Both can be `undefined` when a cached version is reused unchanged.
 */
import type { KeyframeSerializerInput, SerializedKeyframes } from './keyframe-utils';

export function serializeKeyframes(input: KeyframeSerializerInput): SerializedKeyframes {
  const {
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
  } = input;

  const cache = getKeyframesPackedCache();

  // Path A – GPU-preprocessed multi-channel
  if (preprocessEnabled && channelCount > 0) {
    return serializePreprocessedPath(
      archetypeId,
      entityIndicesBuf,
      entityCount,
      timelineBuffer,
      rawChannels,
      channelCount,
      versionSig,
      entitySig,
      preprocessOptions,
      evaluateRawValue,
      timelineFlatEnabled,
      cache,
    );
  }

  // Path B – fixed-layout flat channel
  if (channelCount > 0) {
    return serializeFlatChannelPath(
      archetypeId,
      entityIndicesBuf,
      entityCount,
      timelineBuffer,
      rawChannels,
      channelCount,
      versionSig,
      entitySig,
      cache,
    );
  }

  // Path C – sequential non-flat (no channel layout registered)
  return serializeNonFlatPath(
    archetypeId,
    entityIndicesBuf,
    entityCount,
    timelineBuffer,
    versionSig,
    entitySig,
    timelineFlatEnabled,
    cache,
  );
}
