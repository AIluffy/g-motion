import { TimelineData, Keyframe, SpringOptions, InertiaOptions, Easing } from '@g-motion/core';

export type MarkOptions = {
  to?: any | ((index: number, entityId: number, target?: any) => any);
  time?: number | ((index: number, entityId: number) => number);
  duration?: number; // Relative duration (used with previous mark's end time)
  delay?: number; // Delay before this mark starts (relative)
  easing?: Easing;
  ease?: Easing;
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier';
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  spring?: SpringOptions;
  inertia?: InertiaOptions;
  stagger?: number | ((index: number) => number); // Linear or function-based stagger
};

export type ResolvedMarkOptions = Omit<MarkOptions, 'to' | 'time'> & {
  to: any;
  time: number;
};

export enum TargetType {
  Primitive = 'primitive',
  DOM = 'dom',
  Object = 'object',
}

export function resolveTimeValue(
  opts: MarkOptions,
  currentTime: number,
  index: number,
  entityId: number,
): number {
  if (typeof opts.time === 'function') {
    return opts.time(index, entityId);
  }
  if (typeof opts.time === 'number') {
    return opts.time;
  }

  if (typeof opts.duration === 'number') {
    const delay = opts.delay || 0;
    return currentTime + delay + opts.duration;
  }

  return currentTime + 1000;
}

export function resolveMarkOptions(
  raw: MarkOptions,
  target: any,
  currentTime: number,
  index: number,
  entityId: number,
): ResolvedMarkOptions {
  const time = resolveTimeValue(raw, currentTime, index, entityId);
  const to = typeof raw.to === 'function' ? raw.to(index, entityId, target) : raw.to;

  return {
    ...raw,
    to,
    time,
  };
}

export function computeMaxTime(tracks: TimelineData): number {
  let maxTime = 0;
  for (const track of tracks.values()) {
    for (const kf of track as Keyframe[]) {
      if (kf.time > maxTime) {
        maxTime = kf.time;
      }
    }
  }
  return maxTime;
}

export function getTargetType(target: any): TargetType {
  if (typeof target === 'number') return TargetType.Primitive;
  if (
    typeof target === 'string' ||
    (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement)
  ) {
    return TargetType.DOM;
  }
  return TargetType.Object;
}
