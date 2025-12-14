import { Keyframe } from '@g-motion/core';

export type InterpMode = 'linear' | 'bezier' | 'hold' | 'autoBezier' | 'spring' | 'inertia';

export function getLocalTime(globalTime: number, start: number, end: number): number {
  if (end <= start) return 0;
  const t = globalTime - start;
  if (t <= 0) return 0;
  if (t >= end - start) return end - start;
  return t;
}

export function getProgress(
  globalTime: number,
  kf: Keyframe,
): { localTime: number; progress: number } {
  const duration = Math.max(0, kf.time - kf.startTime);
  if (duration === 0) return { localTime: 0, progress: 1 };
  const localTime = getLocalTime(globalTime, kf.startTime, kf.time);
  const progress = Math.min(1, Math.max(0, localTime / duration));
  return { localTime, progress };
}

export function resolveInterpMode(kf: Keyframe): InterpMode {
  if (kf.spring) return 'spring';
  if (kf.inertia) return 'inertia';
  if (kf.interp === 'hold') return 'hold';
  if (kf.interp === 'bezier') return 'bezier';
  if (kf.interp === 'autoBezier') return 'autoBezier';
  return 'linear';
}
