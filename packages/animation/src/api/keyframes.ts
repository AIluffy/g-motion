import { TimelineData, Keyframe } from '@g-motion/core';
import { ResolvedMarkOptions, TargetType } from './mark';

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
  target: number,
): void {
  const trackKey = '__primitive';
  const track = getOrCreateTrack(tracks, trackKey);
  const { startValue, prevTime } = getTrackContext(track, target);

  if (typeof resolved.to !== 'number' || !Number.isFinite(resolved.to)) {
    if (resolved.inertia) {
      const kf = createKeyframe(prevTime, resolved.time, startValue, startValue, easing, resolved);
      track.push(kf);
      return;
    }
    if (typeof console !== 'undefined') {
      console.warn('[Motion] Skipping primitive keyframe: invalid end value', resolved.to);
    }
    return;
  }

  const kf = createKeyframe(prevTime, resolved.time, startValue, resolved.to, easing, resolved);
  track.push(kf);
}

function addDOMKeyframes(tracks: TimelineData, resolved: ResolvedMarkOptions, easing: any): void {
  const props = resolved.to ?? {};

  for (const [key, endVal] of Object.entries(props)) {
    const track = getOrCreateTrack(tracks, key);
    const { startValue, prevTime } = getTrackContext(track, 0);

    const num = typeof endVal === 'string' ? parseFloat(endVal) : Number(endVal);
    if (!Number.isFinite(num)) {
      if (typeof console !== 'undefined') {
        console.warn('[Motion] Skipping DOM keyframe: invalid end value', key, endVal);
      }
      continue;
    }

    const kf = createKeyframe(prevTime, resolved.time, startValue, num, easing, resolved);
    track.push(kf);
  }
}

function addObjectKeyframes(
  tracks: TimelineData,
  resolved: ResolvedMarkOptions,
  easing: any,
  target: any,
): void {
  const props = resolved.to ?? {};

  for (const [key, endVal] of Object.entries(props)) {
    const track = getOrCreateTrack(tracks, key);
    const initialValue = target && typeof target === 'object' ? ((target as any)[key] ?? 0) : 0;
    const { startValue, prevTime } = getTrackContext(track, initialValue);

    const num = typeof endVal === 'string' ? parseFloat(endVal) : Number(endVal);
    if (!Number.isFinite(num)) {
      if (typeof console !== 'undefined') {
        console.warn('[Motion] Skipping object keyframe: invalid end value', key, endVal);
      }
      continue;
    }

    const kf = createKeyframe(prevTime, resolved.time, startValue, num, easing, resolved);
    track.push(kf);
  }
}

export function addKeyframesForTarget(
  tracks: TimelineData,
  target: any,
  targetType: TargetType,
  resolved: ResolvedMarkOptions,
  easing: any,
): void {
  switch (targetType) {
    case TargetType.Primitive:
      addPrimitiveKeyframe(tracks, resolved, easing, target as number);
      break;
    case TargetType.DOM:
      addDOMKeyframes(tracks, resolved, easing);
      break;
    case TargetType.Object:
      addObjectKeyframes(tracks, resolved, easing, target);
      break;
  }
}
