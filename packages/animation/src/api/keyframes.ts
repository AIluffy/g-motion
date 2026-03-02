import { TimelineData, Keyframe } from '@g-motion/core';
import { TRANSFORM_KEYS, createDebugger } from '@g-motion/shared';
import { ResolvedMarkOptions, TargetType } from './mark';
import type { VisualTarget } from './visual-target';
import { defaultRegistry, ValueType } from '@g-motion/values';

const warn = createDebugger('Keyframes', 'warn');

const domTransformKeys = new Set<string>(TRANSFORM_KEYS as readonly string[]);

function getOrCreateTrack(tracks: TimelineData, key: string): Keyframe[] {
  let track = tracks.get(key);
  if (!track) {
    track = [] as Keyframe[];
    tracks.set(key, track);
  }
  return track as Keyframe[];
}

function getTrackContext(
  track: Keyframe[],
  fallbackValue: number,
): { startValue: number; prevTime: number } {
  if (track.length > 0) {
    const lastKf = track[track.length - 1];
    return {
      startValue: lastKf.endValue,
      prevTime: lastKf.time,
    };
  }
  return {
    startValue: fallbackValue,
    prevTime: 0,
  };
}

function createKeyframe(
  startTime: number,
  time: number,
  startValue: number,
  endValue: number,
  easing: any,
  resolved: ResolvedMarkOptions,
): Keyframe {
  return {
    startTime,
    time,
    startValue,
    endValue,
    easing,
    interp: resolved.interp,
    bezier: resolved.bezier,
    spring: resolved.spring,
    inertia: resolved.inertia,
  };
}

function addPrimitiveKeyframe(
  tracks: TimelineData,
  resolved: ResolvedMarkOptions,
  easing: any,
  visualTarget: VisualTarget,
): void {
  const trackKey = '__primitive';
  const track = getOrCreateTrack(tracks, trackKey);
  const initial = visualTarget.getInitial('__primitive');
  const fallback = typeof initial === 'number' ? initial : 0;
  const { startValue, prevTime } = getTrackContext(track, fallback);

  if (typeof resolved.to !== 'number' || !Number.isFinite(resolved.to)) {
    if (resolved.inertia) {
      const kf = createKeyframe(prevTime, resolved.time, startValue, startValue, easing, resolved);
      track.push(kf);
      return;
    }
    warn('Skipping primitive keyframe: invalid end value', resolved.to);
    return;
  }

  const kf = createKeyframe(prevTime, resolved.time, startValue, resolved.to, easing, resolved);
  track.push(kf);
}

function addDOMKeyframes(
  tracks: TimelineData,
  resolved: ResolvedMarkOptions,
  easing: any,
  visualTarget: VisualTarget,
): void {
  const props = resolved.to ?? {};

  for (const [key, endVal] of Object.entries(props)) {
    const track = getOrCreateTrack(tracks, key);

    if (domTransformKeys.has(key)) {
      const initial = visualTarget.getInitial(key);
      const initialNum = typeof initial === 'number' ? initial : 0;
      const { startValue, prevTime } = getTrackContext(track, initialNum);

      const num = typeof endVal === 'string' ? parseFloat(endVal) : Number(endVal);
      if (!Number.isFinite(num)) {
        warn('Skipping DOM keyframe: invalid end value', key, endVal);
        continue;
      }

      const kf = createKeyframe(prevTime, resolved.time, startValue, num, easing, resolved);
      track.push(kf);
      continue;
    }

    const parser = defaultRegistry.detect(endVal);
    if (parser?.type === ValueType.Number) {
      const initial = visualTarget.getInitial(key);
      const initialNum = typeof initial === 'number' ? initial : parseFloat(String(initial ?? 0));
      const { startValue, prevTime } = getTrackContext(
        track,
        Number.isFinite(initialNum) ? initialNum : 0,
      );

      const num = typeof endVal === 'number' ? endVal : Number(String(endVal).trim());
      if (!Number.isFinite(num)) {
        warn('Skipping DOM keyframe: invalid end value', key, endVal);
        continue;
      }

      const kf = createKeyframe(prevTime, resolved.time, startValue, num, easing, resolved);
      track.push(kf);
      continue;
    }

    const prev = track.length > 0 ? (track[track.length - 1] as any) : undefined;
    const prevTime = prev ? prev.time : 0;

    let fromRaw: unknown;
    if (prev && prev.__to !== undefined) {
      fromRaw = prev.__to;
    } else {
      const current = visualTarget.get(key);
      fromRaw = current !== undefined ? current : endVal;
    }

    if (!parser) {
      warn('Skipping DOM keyframe: unsupported value', key, endVal);
      continue;
    }

    const kf = createKeyframe(prevTime, resolved.time, 0, 1, easing, resolved) as any;
    kf.__from = fromRaw;
    kf.__to = endVal;
    kf.__valueInterp = 'registry';
    track.push(kf);
  }
}

function addObjectKeyframes(
  tracks: TimelineData,
  resolved: ResolvedMarkOptions,
  easing: any,
  visualTarget: VisualTarget,
): void {
  const props = resolved.to ?? {};

  for (const [key, endVal] of Object.entries(props)) {
    const track = getOrCreateTrack(tracks, key);
    if (domTransformKeys.has(key)) {
      const initial = visualTarget.getInitial(key);
      const initialValue = typeof initial === 'number' ? initial : 0;
      const { startValue, prevTime } = getTrackContext(track, initialValue);

      const num = typeof endVal === 'string' ? parseFloat(endVal) : Number(endVal);
      if (!Number.isFinite(num)) {
        warn('Skipping object keyframe: invalid end value', key, endVal);
        continue;
      }

      const kf = createKeyframe(prevTime, resolved.time, startValue, num, easing, resolved);
      track.push(kf);
      continue;
    }

    const parser = defaultRegistry.detect(endVal);
    if (parser?.type === ValueType.Number) {
      const initial = visualTarget.getInitial(key);
      const initialNum = typeof initial === 'number' ? initial : parseFloat(String(initial ?? 0));
      const { startValue, prevTime } = getTrackContext(
        track,
        Number.isFinite(initialNum) ? initialNum : 0,
      );

      const num = typeof endVal === 'number' ? endVal : Number(String(endVal).trim());
      if (!Number.isFinite(num)) {
        warn('Skipping object keyframe: invalid end value', key, endVal);
        continue;
      }

      const kf = createKeyframe(prevTime, resolved.time, startValue, num, easing, resolved);
      track.push(kf);
      continue;
    }

    const prev = track.length > 0 ? (track[track.length - 1] as any) : undefined;
    const prevTime = prev ? prev.time : 0;

    let fromRaw: unknown;
    if (prev && prev.__to !== undefined) {
      fromRaw = prev.__to;
    } else {
      const current = visualTarget.get(key);
      fromRaw = current !== undefined ? current : endVal;
    }

    if (!parser) {
      warn('Skipping object keyframe: unsupported value', key, endVal);
      continue;
    }

    const kf = createKeyframe(prevTime, resolved.time, 0, 1, easing, resolved) as any;
    kf.__from = fromRaw;
    kf.__to = endVal;
    kf.__valueInterp = 'registry';
    track.push(kf);
  }
}

export function addKeyframesForTarget(
  tracks: TimelineData,
  visualTarget: VisualTarget,
  targetType: TargetType,
  resolved: ResolvedMarkOptions,
  easing: any,
): void {
  switch (targetType) {
    case TargetType.Primitive:
      addPrimitiveKeyframe(tracks, resolved, easing, visualTarget);
      break;
    case TargetType.DOM:
      addDOMKeyframes(tracks, resolved, easing, visualTarget);
      break;
    case TargetType.Object:
      addObjectKeyframes(tracks, resolved, easing, visualTarget);
      break;
  }
}
