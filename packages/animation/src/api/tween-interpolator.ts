import { lerp } from '@g-motion/shared';
import type { Interpolator } from './interpolator';

const linearEasing = (t: number): number => t;

export class TweenInterpolator implements Interpolator {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly easing: (t: number) => number = linearEasing,
  ) {}

  evaluate(progress: number): number {
    return lerp(this.from, this.to, this.easing(progress));
  }
}
