/**
 * Keyframe Path A – Preprocessed Multi-Channel
 *
 * Builds a clip-deduplication model using {@link preprocessChannelsToRawAndMap}
 * and returns both the packed keyframe buffer and the {@link PreprocessedKeyframes}
 * object consumed by the GPU preprocessed-keyframe pipeline.
 *
 * Entities sharing identical `timeline.tracks` reference are mapped to the same
 * clip slot, avoiding redundant preprocessing work.
 */

import type { TimelineData, Track } from '@g-motion/shared';
import { getGPUModuleSync } from '../../gpu-bridge';
import type { RawKeyframeGenerationOptions, RawKeyframeValueEvaluator } from '../../gpu-bridge/types';
import { KEYFRAME_FLOATS, MAX_KEYFRAMES_PER_CHANNEL } from './constants';
import type { PackedCacheMap, SerializedKeyframes } from './keyframe-utils';
import { getFlatTracks, tryReusePackedCache } from './keyframe-utils';
import { bufferCache } from './utils';

export function serializePreprocessedPath(
  archetypeId: string,
  entityIndicesBuf: Int32Array,
  entityCount: number,
  timelineBuffer: Array<unknown>,
  rawChannels: Array<{ index: number; property: string }>,
  channelCount: number,
  versionSig: number,
  entitySig: number,
  preprocessOptions: RawKeyframeGenerationOptions,
  evaluateRawValue: RawKeyframeValueEvaluator,
  timelineFlatEnabled: boolean,
  packedCacheMap: PackedCacheMap,
): SerializedKeyframes {
  const gpu = getGPUModuleSync();
  if (!gpu) {
    throw new Error(
      "WebGPU module not loaded. Call preloadWebGPUModule() during initialization.",
    );
  }

  const rawKeyframesByClip: Float32Array[] = [];
  const channelMapByClip: Uint32Array[] = [];
  const clipIndexByEntity = new Uint32Array(entityCount);
  const clipIndexByTracks = new Map<unknown, number>();
  const rawKfPerEntity = new Array<Float32Array>(entityCount);
  const chanMapPerEntity = new Array<Uint32Array>(entityCount);

  for (let eIndex = 0; eIndex < entityCount; eIndex++) {
    const i = entityIndicesBuf[eIndex];
    const timeline = timelineBuffer[i] as { tracks?: TimelineData };
    if (timelineFlatEnabled) getFlatTracks(timeline);
    const tracks = timeline.tracks as TimelineData | undefined;

    // Empty / no tracks → empty clip
    if (!tracks || tracks.size === 0) {
      let ci = clipIndexByTracks.get(tracks);
      if (ci === undefined) {
        ci = rawKeyframesByClip.length;
        clipIndexByTracks.set(tracks, ci);
        rawKeyframesByClip.push(new Float32Array(0));
        channelMapByClip.push(new Uint32Array(0));
      }
      clipIndexByEntity[eIndex] = ci;
      rawKfPerEntity[eIndex] = rawKeyframesByClip[ci];
      chanMapPerEntity[eIndex] = channelMapByClip[ci];
      continue;
    }

    // Clip already processed for an identical tracks reference
    let ci = clipIndexByTracks.get(tracks);
    if (ci !== undefined) {
      clipIndexByEntity[eIndex] = ci;
      rawKfPerEntity[eIndex] = rawKeyframesByClip[ci];
      chanMapPerEntity[eIndex] = channelMapByClip[ci];
      continue;
    }

    // Collect per-channel track segments
    type ChannelTrackSegment = {
      property: string;
      track: {
        startTime: number;
        time: number;
        startValue: number;
        endValue: number;
        easing: unknown;
      }[];
    };
    const channelTracks: ChannelTrackSegment[] = [];
    for (let cIndex = 0; cIndex < channelCount; cIndex++) {
      const prop = rawChannels[cIndex].property;
      const track = tracks.get(prop) as Track | undefined;
      if (!track || track.length === 0) continue;
      const truncated =
        track.length > MAX_KEYFRAMES_PER_CHANNEL
          ? (track.slice(0, MAX_KEYFRAMES_PER_CHANNEL) as unknown as ChannelTrackSegment['track'])
          : (track as unknown as ChannelTrackSegment['track']);
      channelTracks.push({ property: prop, track: truncated });
    }

    if (channelTracks.length === 0) {
      ci = rawKeyframesByClip.length;
      clipIndexByTracks.set(tracks, ci);
      rawKeyframesByClip.push(new Float32Array(0));
      channelMapByClip.push(new Uint32Array(0));
    } else {
      const { rawKeyframes, channelMaps } = gpu.preprocessChannelsToRawAndMap(
        channelTracks,
        preprocessOptions,
        evaluateRawValue,
      );
      ci = rawKeyframesByClip.length;
      clipIndexByTracks.set(tracks, ci);
      rawKeyframesByClip.push(gpu.packRawKeyframes(rawKeyframes));
      channelMapByClip.push(gpu.packChannelMaps(channelMaps));
    }

    clipIndexByEntity[eIndex] = ci;
    rawKfPerEntity[eIndex] = rawKeyframesByClip[ci];
    chanMapPerEntity[eIndex] = channelMapByClip[ci];
  }

  const required = entityCount * channelCount * MAX_KEYFRAMES_PER_CHANNEL * KEYFRAME_FLOATS;
  const reused = tryReusePackedCache(
    archetypeId,
    packedCacheMap,
    versionSig,
    entitySig,
    channelCount,
    required,
  );
  const keyframesData = reused ?? bufferCache.getKeyframesBuffer(archetypeId, required);
  if (!reused)
    packedCacheMap.set(archetypeId, { versionSig, entitySig, channelCount, buffer: keyframesData });

  return {
    keyframesData,
    preprocessed: {
      rawKeyframesPerEntity: rawKfPerEntity,
      channelMapPerEntity: chanMapPerEntity,
      clipModel: { rawKeyframesByClip, channelMapByClip, clipIndexByEntity },
    },
  };
}
