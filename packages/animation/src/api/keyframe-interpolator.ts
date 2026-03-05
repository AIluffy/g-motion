import { lerp } from '@g-motion/shared';
import type { Interpolator } from './interpolator';

const linearEasing = (t: number): number => t;

export class KeyframeInterpolator implements Interpolator {
  constructor(
    private readonly keyframes: number[],
    private readonly easing: (t: number) => number = linearEasing,
  ) {}

  evaluate(progress: number): number {
    if (this.keyframes.length === 0) {
      return 0;
    }

    if (this.keyframes.length === 1) {
      return this.keyframes[0];
    }

    const clampedProgress = Math.max(0, Math.min(1, progress));
    const scaled = clampedProgress * (this.keyframes.length - 1);
    const index = Math.floor(scaled);
    const localProgress = scaled - index;

    if (index >= this.keyframes.length - 1) {
      return this.keyframes[this.keyframes.length - 1];
    }

    return lerp(this.keyframes[index], this.keyframes[index + 1], this.easing(localProgress));
  }
}
