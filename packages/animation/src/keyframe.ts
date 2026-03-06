import type { Easing, Keyframe } from './facade/types';

export function keyframe(time: number, value: number, easing?: Easing): Keyframe {
  if (easing === undefined) {
    return { time, value };
  }

  return { time, value, easing };
}
