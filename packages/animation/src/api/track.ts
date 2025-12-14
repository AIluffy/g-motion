import type { MarkOptions, MotionBuilder } from './builder';
import { Easing, SpringOptions, InertiaOptions } from '@g-motion/core';

export type TrackMarkOptions = {
  time?: number;
  duration?: number;
  easing?: Easing;
  ease?: Easing;
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier';
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  spring?: SpringOptions;
  inertia?: InertiaOptions;
};

export class TrackBuilder {
  constructor(
    private parent: MotionBuilder,
    private prop: string,
  ) {}

  set(timeOrDuration: number, to: number, options: TrackMarkOptions = {}): this {
    const payload: TrackMarkOptions & { to: Record<string, number> } = {
      ...options,
      to: { [this.prop]: to },
    };

    if (options.duration !== undefined) {
      payload.duration = options.duration ?? timeOrDuration;
    } else {
      payload.time = options.time ?? timeOrDuration;
    }

    this.parent.mark([payload as MarkOptions]);
    return this;
  }

  track(prop: string): TrackBuilder {
    return this.parent.track(prop);
  }

  adjust(params: { offset?: number; scale?: number }): MotionBuilder {
    return this.parent.adjust(params);
  }

  animate(options?: Parameters<MotionBuilder['animate']>[0]) {
    return this.parent.animate(options);
  }
}

export function track(builder: MotionBuilder, prop: string): TrackBuilder {
  return new TrackBuilder(builder, prop);
}
