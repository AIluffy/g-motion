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

import type { Keyframe, PreprocessedKeyframes, TimelineData, Track } from '@g-motion/shared';
import { getEasingId, TimelineTracksMap } from '@g-motion/shared';
import type { RawKeyframeGenerationOptions, RawKeyframeValueEvaluator } from '@g-motion/webgpu';
import {
  EASING_MODE_BEZIER,
  EASING_MODE_HOLD,
  EASING_MODE_STANDARD,
  MIN_GPU_KEYFRAME_DURATION,
} from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BezierKf = Keyframe & {
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
};

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

export function getEasingName(easing?: unknown): string {
  if (!easing) return 'linear';
  return easing as string;
}

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

/**
 * Pack a single keyframe into `buf` at `offset` (10 contiguous floats).
 * Layout: [startTime, duration, startValue, endValue, easingId, cx1, cy1, cx2, cy2, easingMode]
 */
export function writeSingleKeyframe(buf: Float32Array, offset: number, kf: BezierKf): void {
  const easingId = getEasingId(getEasingName(kf.easing));
  let easingMode = EASING_MODE_STANDARD;
  if (kf.interp === 'hold') easingMode = EASING_MODE_HOLD;
  else if (kf.bezier || kf.interp === 'bezier') easingMode = EASING_MODE_BEZIER;

  const startTime = kf.startTime ?? 0;
  const dur = (kf.time ?? 0) - startTime;
  buf[offset] = startTime;
  buf[offset + 1] = dur > 0 ? dur : MIN_GPU_KEYFRAME_DURATION;
  buf[offset + 2] = kf.startValue;
  buf[offset + 3] = kf.endValue;
  buf[offset + 4] = easingId;
  buf[offset + 5] = kf.bezier?.cx1 ?? 0;
  buf[offset + 6] = kf.bezier?.cy1 ?? 0;
  buf[offset + 7] = kf.bezier?.cx2 ?? 1;
  buf[offset + 8] = kf.bezier?.cy2 ?? 1;
  buf[offset + 9] = easingMode;
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
