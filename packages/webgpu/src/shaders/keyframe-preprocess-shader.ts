/**
 * Keyframe Preprocessing GPU Shader (Phase 3.1)
 *
 * GPU-accelerated keyframe data preparation and packing.
 * Handles channel mapping, easing ID resolution, and data layout optimization.
 */

import { getEasingId } from '@g-motion/shared';
import keyframeEntryExpandShaderCode from './keyframe-entry-expand.wgsl?raw';
import keyframeInterpFromSearchShaderCode from './keyframe-interp-from-search.wgsl?raw';
import keyframePreprocessShaderCode from './keyframe-preprocess.wgsl?raw';
import keyframeSearchOptShaderCode from './keyframe-search-opt.wgsl?raw';
import keyframeSearchWindowShaderCode from './keyframe-search-window.wgsl?raw';
import keyframeSearchShaderCode from './keyframe-search.wgsl?raw';
import stringSearchShaderCode from './string-search.wgsl?raw';

export const KEYFRAME_PREPROCESS_SHADER = keyframePreprocessShaderCode;
export const KEYFRAME_SEARCH_SHADER = keyframeSearchShaderCode;
export const KEYFRAME_SEARCH_SHADER_OPT = keyframeSearchOptShaderCode;
export const KEYFRAME_ENTRY_EXPAND_SHADER = keyframeEntryExpandShaderCode;
export const KEYFRAME_SEARCH_WINDOW_SHADER = keyframeSearchWindowShaderCode;
export const KEYFRAME_INTERP_FROM_SEARCH_SHADER = keyframeInterpFromSearchShaderCode;
export const STRING_SEARCH_SHADER = stringSearchShaderCode;

export interface RawKeyframeData {
  startTime: number;
  endTime: number;
  startValue: number;
  endValue: number;
  easingType: number;
  easingParam1?: number;
  easingParam2?: number;
}

export interface ChannelMapData {
  propertyHash: number;
  channelIndex: number;
  entityOffset: number;
  keyframeCount: number;
}

export const EASING_TYPE = {
  LINEAR: 0,
  EASE_IN_QUAD: 1,
  EASE_OUT_QUAD: 2,
  EASE_IN_OUT_QUAD: 3,
  EASE_IN_CUBIC: 4,
  EASE_OUT_CUBIC: 5,
  EASE_IN_OUT_CUBIC: 6,
  EASE_IN_QUART: 7,
  EASE_OUT_QUART: 8,
  EASE_IN_OUT_QUART: 9,
  EASE_IN_QUINT: 10,
  EASE_OUT_QUINT: 11,
  EASE_IN_OUT_QUINT: 12,
  EASE_IN_SINE: 13,
  EASE_OUT_SINE: 14,
  EASE_IN_OUT_SINE: 15,
  EASE_IN_EXPO: 16,
  EASE_OUT_EXPO: 17,
  EASE_IN_OUT_EXPO: 18,
  EASE_IN_CIRC: 19,
  EASE_OUT_CIRC: 20,
  EASE_IN_OUT_CIRC: 21,
  EASE_IN_BACK: 22,
  EASE_OUT_BACK: 23,
  EASE_IN_OUT_BACK: 24,
  EASE_IN_ELASTIC: 25,
  EASE_OUT_ELASTIC: 26,
  EASE_IN_OUT_ELASTIC: 27,
  EASE_IN_BOUNCE: 28,
  EASE_OUT_BOUNCE: 29,
  EASE_IN_OUT_BOUNCE: 30,
  BEZIER: 100,
  HOLD: 101,
} as const;

export const RAW_KEYFRAME_STRIDE = 8;
export const PACKED_KEYFRAME_STRIDE = 5;
export const CHANNEL_MAP_STRIDE = 4;
export const SEARCH_RESULT_STRIDE = 4;

export function packRawKeyframes(keyframes: RawKeyframeData[]): Float32Array {
  const data = new Float32Array(keyframes.length * RAW_KEYFRAME_STRIDE);
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const offset = i * RAW_KEYFRAME_STRIDE;
    data[offset + 0] = kf.startTime;
    data[offset + 1] = kf.endTime;
    data[offset + 2] = kf.startValue;
    data[offset + 3] = kf.endValue;
    // Store easingType as float (will be cast to u32 in shader)
    const uint32View = new Uint32Array(data.buffer, (offset + 4) * 4, 1);
    uint32View[0] = kf.easingType;
    data[offset + 5] = kf.easingParam1 ?? 0;
    data[offset + 6] = kf.easingParam2 ?? 0;
    data[offset + 7] = 0; // padding
  }
  return data;
}

export function packChannelMaps(maps: ChannelMapData[]): Uint32Array {
  const data = new Uint32Array(maps.length * CHANNEL_MAP_STRIDE);
  for (let i = 0; i < maps.length; i++) {
    const m = maps[i];
    const offset = i * CHANNEL_MAP_STRIDE;
    data[offset + 0] = m.propertyHash;
    data[offset + 1] = m.channelIndex;
    data[offset + 2] = m.entityOffset;
    data[offset + 3] = m.keyframeCount;
  }
  return data;
}

export function hashPropertyName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash >>> 0; // Convert to unsigned
}

export const PROPERTY_HASHES = {
  x: hashPropertyName('x'),
  y: hashPropertyName('y'),
  z: hashPropertyName('z'),
  rotation: hashPropertyName('rotation'),
  rotateX: hashPropertyName('rotateX'),
  rotateY: hashPropertyName('rotateY'),
  rotateZ: hashPropertyName('rotateZ'),
  scaleX: hashPropertyName('scaleX'),
  scaleY: hashPropertyName('scaleY'),
  scaleZ: hashPropertyName('scaleZ'),
  scale: hashPropertyName('scale'),
  opacity: hashPropertyName('opacity'),
  width: hashPropertyName('width'),
  height: hashPropertyName('height'),
} as const;

export function easingStringToType(easing: string | undefined): number {
  if (!easing) return EASING_TYPE.LINEAR;
  if (easing === 'hold') return EASING_TYPE.HOLD;
  return getEasingId(easing);
}

export interface RawKeyframeGenerationOptions {
  timeInterval: number;
  maxSubdivisionsPerSegment?: number;
}

export type RawKeyframeValueEvaluator = (
  keyframe: {
    startTime: number;
    time: number;
    startValue: number;
    endValue: number;
    easing: unknown;
  },
  t: number,
) => number;

export function generateRawKeyframesForTrack(
  track: Array<{
    startTime: number;
    time: number;
    startValue: number;
    endValue: number;
    easing: unknown;
  }>,
  options: RawKeyframeGenerationOptions,
  evaluate: RawKeyframeValueEvaluator,
): RawKeyframeData[] {
  const result: RawKeyframeData[] = [];
  if (!Array.isArray(track) || track.length === 0) return result;
  const timeInterval = options.timeInterval > 0 ? options.timeInterval : 1;
  const maxSubs =
    options.maxSubdivisionsPerSegment && options.maxSubdivisionsPerSegment > 0
      ? options.maxSubdivisionsPerSegment
      : 4;
  for (let i = 0; i < track.length; i++) {
    const kf = track[i];
    const segStart = kf.startTime;
    const segEnd = kf.time;
    let duration = segEnd - segStart;
    if (!(duration > 0)) {
      const value = evaluate(kf, segStart);
      result.push({
        startTime: segStart,
        endTime: segStart,
        startValue: value,
        endValue: value,
        easingType: easingStringToType(typeof kf.easing === 'string' ? kf.easing : undefined),
        easingParam1: 0,
        easingParam2: 0,
      });
      continue;
    }
    let nSub = Math.ceil(duration / timeInterval);
    if (!(nSub > 0)) nSub = 1;
    if (nSub < 2 && maxSubs >= 2) nSub = 2;
    if (nSub > maxSubs) nSub = maxSubs;
    const subDuration = duration / nSub;
    for (let j = 0; j < nSub; j++) {
      const subStart = segStart + j * subDuration;
      let subEnd = subStart + subDuration;
      if (j === nSub - 1) subEnd = segEnd;
      const startValue = evaluate(kf, subStart);
      const endValue = evaluate(kf, subEnd);
      result.push({
        startTime: subStart,
        endTime: subEnd,
        startValue,
        endValue,
        easingType: easingStringToType(typeof kf.easing === 'string' ? kf.easing : undefined),
        easingParam1: 0,
        easingParam2: 0,
      });
    }
  }
  return result;
}

export interface ChannelInputDesc {
  property: string;
  keyframeCount: number;
}

export function buildChannelMapData(
  channels: ChannelInputDesc[],
  baseOffset: number,
): ChannelMapData[] {
  const result: ChannelMapData[] = [];
  let offset = baseOffset;
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const hash =
      (PROPERTY_HASHES as Record<string, number>)[c.property] ?? hashPropertyName(c.property);
    result.push({
      propertyHash: hash,
      channelIndex: i,
      entityOffset: offset,
      keyframeCount: c.keyframeCount,
    });
    offset += c.keyframeCount;
  }
  return result;
}

export interface ChannelTrackInput {
  property: string;
  track: Array<{
    startTime: number;
    time: number;
    startValue: number;
    endValue: number;
    easing: unknown;
  }>;
}

export function preprocessChannelsToRawAndMap(
  channels: ChannelTrackInput[],
  options: RawKeyframeGenerationOptions,
  evaluate: RawKeyframeValueEvaluator,
): { rawKeyframes: RawKeyframeData[]; channelMaps: ChannelMapData[] } {
  const rawKeyframes: RawKeyframeData[] = [];
  const channelDescs: ChannelInputDesc[] = [];
  let offset = 0;
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const raws = generateRawKeyframesForTrack(c.track, options, evaluate);
    const count = raws.length;
    for (let j = 0; j < count; j++) {
      rawKeyframes.push(raws[j]);
    }
    channelDescs.push({
      property: c.property,
      keyframeCount: count,
    });
    offset += count;
  }
  const channelMaps = buildChannelMapData(channelDescs, 0);
  return { rawKeyframes, channelMaps };
}
