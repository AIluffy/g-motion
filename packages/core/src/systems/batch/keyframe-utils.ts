/**
 * Keyframe Utilities
 *
 * Shared helpers used by all three keyframe serialization paths:
 *   - writeSingleKeyframe: inline-packs one Keyframe into a Float32Array slot
 *   - getFlatTracks: normalise timeline.tracks → TimelineTracksMap on first access
 *   - getEasingName: coerce the Easing field to a plain string
 *
 * Also re-exports the public types shared across keyframe-path-*.ts files.
 */

import type { PreprocessedKeyframes, TimelineData, Track } from '@g-motion/shared';
import { TimelineTracksMap } from '@g-motion/shared';
import type {
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
} from '../../runtime/gpu-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PackedCacheMap = Map<
  string,
  { versionSig: number; entitySig: number; channelCount: number; buffer: Float32Array }
>;

export interface SerializedKeyframes {
  keyframesData: Float32Array;
  preprocessed: PreprocessedKeyframes | undefined;
}

export interface KeyframeSerializerInput {
  archetypeId: string;
  entityIndicesBuf: Int32Array;
  entityCount: number;
  timelineBuffer: Array<unknown>;
  rawChannels: Array<{ index: number; property: string }>;
  channelCount: number;
  versionSig: number;
  entitySig: number;
  preprocessEnabled: boolean;
  timelineFlatEnabled: boolean;
  preprocessOptions: RawKeyframeGenerationOptions;
  evaluateRawValue: RawKeyframeValueEvaluator;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise `timeline.tracks` to a {@link TimelineTracksMap} (mutates in place
 * on first call so subsequent calls are O(1) no-ops).
 */
export function getFlatTracks(timeline: {
  tracks?: TimelineData;
}): { keys: readonly string[]; values: readonly Track[] } | undefined {
  const tracks = timeline.tracks;
  if (!tracks || tracks.size === 0) return undefined;
  if (tracks instanceof TimelineTracksMap) {
    return { keys: tracks.flatKeys, values: tracks.flatValues };
  }
  const wrapped = new TimelineTracksMap(tracks as Iterable<readonly [string, Track]>);
  timeline.tracks = wrapped;
  return { keys: wrapped.flatKeys, values: wrapped.flatValues };
}

/** Check & return cached keyframe buffer if version + entity + channel match. */
export function tryReusePackedCache(
  archetypeId: string,
  packedCacheMap: PackedCacheMap,
  versionSig: number,
  entitySig: number,
  channelCount: number,
  required: number,
): Float32Array | undefined {
  const cached = packedCacheMap.get(archetypeId);
  if (
    cached &&
    cached.versionSig === versionSig &&
    cached.entitySig === entitySig &&
    cached.channelCount === channelCount &&
    cached.buffer.length >= required
  ) {
    return cached.buffer.subarray(0, required);
  }
  return undefined;
}
