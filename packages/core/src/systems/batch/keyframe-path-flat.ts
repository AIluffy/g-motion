/**
 * Keyframe Path B – Traditional Flat (Fixed Channel Layout)
 *
 * Packs keyframes into a dense 3-D block:
 *   [entity][channel][keyframeSlot] × KEYFRAME_FLOATS
 *
 * All MAX_KEYFRAMES_PER_CHANNEL slots are always written (zeroed when unused)
 * so the GPU can index directly without bounds checks.
 */

import type { TimelineData, Track } from '@g-motion/shared';
import { KEYFRAME_FLOATS, MAX_KEYFRAMES_PER_CHANNEL } from './constants';
import type { BezierKf, PackedCacheMap, SerializedKeyframes } from './keyframe-utils';
import { tryReusePackedCache, writeSingleKeyframe } from './keyframe-utils';
import { bufferCache } from './utils';

export function serializeFlatChannelPath(
  archetypeId: string,
  entityIndicesBuf: Int32Array,
  entityCount: number,
  timelineBuffer: Array<unknown>,
  rawChannels: Array<{ index: number; property: string }>,
  channelCount: number,
  versionSig: number,
  entitySig: number,
  packedCacheMap: PackedCacheMap,
): SerializedKeyframes {
  const required = entityCount * channelCount * MAX_KEYFRAMES_PER_CHANNEL * KEYFRAME_FLOATS;
  const reused = tryReusePackedCache(
    archetypeId,
    packedCacheMap,
    versionSig,
    entitySig,
    channelCount,
    required,
  );
  if (reused) return { keyframesData: reused, preprocessed: undefined };

  const keyframesData = bufferCache.getKeyframesBuffer(archetypeId, required);

  for (let eIndex = 0; eIndex < entityCount; eIndex++) {
    const i = entityIndicesBuf[eIndex];
    const tracks = (timelineBuffer[i] as { tracks?: TimelineData }).tracks as
      | TimelineData
      | undefined;

    for (let cIndex = 0; cIndex < channelCount; cIndex++) {
      const prop = rawChannels[cIndex].property;
      const track = tracks?.get(prop) as Track | undefined;
      const count = track ? Math.min(track.length, MAX_KEYFRAMES_PER_CHANNEL) : 0;

      for (let kIndex = 0; kIndex < MAX_KEYFRAMES_PER_CHANNEL; kIndex++) {
        const offset =
          (eIndex * channelCount * MAX_KEYFRAMES_PER_CHANNEL +
            cIndex * MAX_KEYFRAMES_PER_CHANNEL +
            kIndex) *
          KEYFRAME_FLOATS;

        if (track && kIndex < count) {
          writeSingleKeyframe(keyframesData, offset, track[kIndex] as BezierKf);
        } else {
          for (let f = 0; f < KEYFRAME_FLOATS; f++) keyframesData[offset + f] = 0;
        }
      }
    }
  }

  packedCacheMap.set(archetypeId, { versionSig, entitySig, channelCount, buffer: keyframesData });
  return { keyframesData, preprocessed: undefined };
}
