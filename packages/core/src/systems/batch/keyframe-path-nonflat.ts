/**
 * Keyframe Path C – Traditional Non-Flat (No Fixed Channel Layout)
 *
 * Used when `channelCount === 0` (no registered GPU channel mapping for
 * this archetype). Iterates all tracks in each entity's Timeline and packs
 * every keyframe sequentially into a single flat buffer.
 *
 * Supports both the flat-track map optimisation (`timelineFlatEnabled`)
 * and standard Map<string, Track> iteration.
 */

import type { TimelineData, Track } from '@g-motion/shared';
import { KEYFRAME_FLOATS } from './constants';
import type { KeyframeLike } from './keyframe-pack';
import { packSingleKeyframe } from './keyframe-pack';
import type { PackedCacheMap, SerializedKeyframes } from './keyframe-utils';
import { getFlatTracks, tryReusePackedCache } from './keyframe-utils';
import { bufferCache } from './utils';

export function serializeNonFlatPath(
  archetypeId: string,
  entityIndicesBuf: Int32Array,
  entityCount: number,
  timelineBuffer: Array<unknown>,
  versionSig: number,
  entitySig: number,
  timelineFlatEnabled: boolean,
  packedCacheMap: PackedCacheMap,
): SerializedKeyframes {
  // First pass: count total keyframes to size the output buffer
  let totalKeyframes = 0;
  for (let eIndex = 0; eIndex < entityCount; eIndex++) {
    const i = entityIndicesBuf[eIndex];
    const timeline = timelineBuffer[i] as { tracks?: TimelineData };
    if (timelineFlatEnabled) {
      const flat = getFlatTracks(timeline);
      if (flat)
        for (const t of flat.values) {
          if (Array.isArray(t)) totalKeyframes += t.length;
        }
    } else {
      const tracks = timeline.tracks as TimelineData | undefined;
      if (tracks && tracks.size > 0) {
        for (const [, t] of tracks) {
          if (Array.isArray(t)) totalKeyframes += t.length;
        }
      }
    }
  }

  const size = Math.max(KEYFRAME_FLOATS, totalKeyframes * KEYFRAME_FLOATS);
  const reused = tryReusePackedCache(archetypeId, packedCacheMap, versionSig, entitySig, 0, size);
  if (reused) return { keyframesData: reused, preprocessed: undefined };

  const keyframesData = bufferCache.getKeyframesBuffer(archetypeId, size);
  let w = 0;

  const writeTrack = (track: Track) => {
    if (!Array.isArray(track) || track.length === 0) return;
    for (const kf of track) {
      packSingleKeyframe(kf as KeyframeLike, keyframesData, w);
      w += KEYFRAME_FLOATS;
    }
  };

  // Second pass: write keyframes
  for (let eIndex = 0; eIndex < entityCount; eIndex++) {
    const i = entityIndicesBuf[eIndex];
    const timeline = timelineBuffer[i] as { tracks?: TimelineData };
    if (timelineFlatEnabled) {
      const flat = getFlatTracks(timeline);
      if (flat) flat.values.forEach(writeTrack);
    } else {
      const tracks = timeline.tracks as TimelineData | undefined;
      if (tracks && tracks.size > 0) for (const [, t] of tracks) writeTrack(t as Track);
    }
  }

  for (; w < size; w++) keyframesData[w] = 0;
  packedCacheMap.set(archetypeId, {
    versionSig,
    entitySig,
    channelCount: 0,
    buffer: keyframesData,
  });
  return { keyframesData, preprocessed: undefined };
}
