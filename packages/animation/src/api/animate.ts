import type { Easing } from '@g-motion/core';
import { TargetType, getTargetType } from './mark';
import type { AnimationControl } from './control';
import type { MarkOptions } from './mark';
import { motion } from '..';

export interface AnimateOptions {
  duration?: number;
  delay?: number;
  ease?: Easing;
  repeat?: number;
  repeatType?: 'loop' | 'reverse';
  times?: number[];
  onUpdate?: (latest: any) => void;
  onComplete?: () => void;
}

const DEFAULT_DURATION = 300;

function applyAnimateMark(
  builder: { mark(mark: MarkOptions | MarkOptions[]): unknown },
  to: number | Record<string, unknown>,
  options: AnimateOptions | undefined,
  targetType: TargetType,
) {
  const totalDuration = options?.duration ?? DEFAULT_DURATION;

  if (targetType === TargetType.Primitive && typeof to === 'number') {
    const mark: MarkOptions = {
      to,
      duration: totalDuration,
      ease: options?.ease,
    };
    builder.mark(mark);
    return;
  }

  if (!to || typeof to !== 'object') {
    const mark: MarkOptions = {
      to,
      duration: totalDuration,
      ease: options?.ease,
    };
    builder.mark(mark);
    return;
  }

  const values = Object.values(to);
  const hasKeyframes = values.some((v) => Array.isArray(v));

  if (!hasKeyframes) {
    let markTo: any = to;

    if (targetType === TargetType.Primitive) {
      const keys = Object.keys(to);
      if (keys.length === 1 && (keys[0] === 'value' || keys[0] === '__primitive')) {
        markTo = to[keys[0]];
      }
    }

    const mark: MarkOptions = {
      to: markTo,
      duration: totalDuration,
      ease: options?.ease,
    };
    builder.mark(mark);
    return;
  }

  const keys = Object.keys(to);
  let keyframeCount = 0;

  for (const key of keys) {
    const v = to[key];
    if (Array.isArray(v)) {
      if (keyframeCount === 0) {
        keyframeCount = v.length;
      } else if (v.length !== keyframeCount) {
        throw new Error('All keyframe arrays must have the same length');
      }
    }
  }

  if (keyframeCount <= 1) {
    const mark: MarkOptions = {
      to,
      duration: totalDuration,
      ease: options?.ease,
    };
    builder.mark(mark);
    return;
  }

  const marks: MarkOptions[] = [];
  const segmentDurations: number[] = [];

  for (let i = 1; i < keyframeCount; i++) {
    const segmentTo: Record<string, unknown> = {};
    let segmentDuration = totalDuration / (keyframeCount - 1);

    if (options?.times && options.times.length === keyframeCount) {
      const prev = options.times[i - 1];
      const next = options.times[i];
      const delta = (next - prev) * totalDuration;
      if (Number.isFinite(delta) && delta >= 0) {
        segmentDuration = delta;
      }
    }

    segmentDurations.push(segmentDuration);

    for (const key of keys) {
      const v = to[key];
      if (Array.isArray(v)) {
        segmentTo[key] = v[i];
      } else {
        segmentTo[key] = v;
      }
    }

    marks.push({
      to: segmentTo,
      duration: segmentDuration,
      ease: options?.ease,
    });
  }

  if (options?.repeatType === 'reverse') {
    for (let i = keyframeCount - 2; i >= 0; i--) {
      const segmentTo: Record<string, unknown> = {};

      for (const key of keys) {
        const v = to[key];
        if (Array.isArray(v)) {
          segmentTo[key] = v[i];
        } else {
          segmentTo[key] = v;
        }
      }

      marks.push({
        to: segmentTo,
        duration: segmentDurations[i],
        ease: options?.ease,
      });
    }
  }

  builder.mark(marks);
}

export function animate(
  target: any,
  to: number | Record<string, unknown>,
  options?: AnimateOptions,
): AnimationControl {
  const builder = motion(target);
  const targetType = getTargetType(target);

  applyAnimateMark(builder, to, options, targetType);

  if (options) {
    builder.option({
      delay: options.delay,
      repeat: options.repeat,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
    });
  }

  return builder.play();
}
