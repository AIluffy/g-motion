import { panic, type Easing } from '@g-motion/shared';
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

function isKeyframeObject(to: unknown): to is Record<string, unknown> {
  return !!to && typeof to === 'object';
}

function hasAnyKeyframeArrays(to: Record<string, unknown>): boolean {
  for (const v of Object.values(to)) {
    if (Array.isArray(v)) return true;
  }
  return false;
}

function normalizePrimitiveObjectTo(to: Record<string, unknown>): unknown {
  const keys = Object.keys(to);
  if (keys.length === 1 && (keys[0] === 'value' || keys[0] === '__primitive')) {
    return to[keys[0]];
  }
  return to;
}

function resolveKeyframeCount(keys: string[], to: Record<string, unknown>): number {
  let keyframeCount = 0;
  for (const key of keys) {
    const v = to[key];
    if (!Array.isArray(v)) continue;
    if (keyframeCount === 0) {
      keyframeCount = v.length;
    } else if (v.length !== keyframeCount) {
      panic('All keyframe arrays must have the same length', {
        property: key,
        expectedLength: keyframeCount,
        actualLength: v.length,
      });
    }
  }
  return keyframeCount;
}

function resolveSegmentDuration(
  index: number,
  keyframeCount: number,
  totalDuration: number,
  options: AnimateOptions | undefined,
): number {
  let segmentDuration = totalDuration / (keyframeCount - 1);
  if (options?.times && options.times.length === keyframeCount) {
    const prev = options.times[index - 1];
    const next = options.times[index];
    const delta = (next - prev) * totalDuration;
    if (Number.isFinite(delta) && delta >= 0) {
      segmentDuration = delta;
    }
  }
  return segmentDuration;
}

function buildSegmentTo(
  keys: string[],
  to: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const segmentTo: Record<string, unknown> = {};
  for (const key of keys) {
    const v = to[key];
    segmentTo[key] = Array.isArray(v) ? v[index] : v;
  }
  return segmentTo;
}

function buildKeyframeMarks(
  keys: string[],
  to: Record<string, unknown>,
  keyframeCount: number,
  totalDuration: number,
  options: AnimateOptions | undefined,
): MarkOptions[] {
  const marks: MarkOptions[] = [];
  const segmentDurations: number[] = [];

  for (let i = 1; i < keyframeCount; i++) {
    const segmentDuration = resolveSegmentDuration(i, keyframeCount, totalDuration, options);
    segmentDurations.push(segmentDuration);
    marks.push({
      to: buildSegmentTo(keys, to, i),
      duration: segmentDuration,
      ease: options?.ease,
    });
  }

  if (options?.repeatType === 'reverse') {
    for (let i = keyframeCount - 2; i >= 0; i--) {
      marks.push({
        to: buildSegmentTo(keys, to, i),
        duration: segmentDurations[i],
        ease: options?.ease,
      });
    }
  }

  return marks;
}

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

  if (!isKeyframeObject(to)) {
    const mark: MarkOptions = {
      to,
      duration: totalDuration,
      ease: options?.ease,
    };
    builder.mark(mark);
    return;
  }

  if (!hasAnyKeyframeArrays(to)) {
    const markTo = targetType === TargetType.Primitive ? normalizePrimitiveObjectTo(to) : to;
    builder.mark({ to: markTo, duration: totalDuration, ease: options?.ease });
    return;
  }

  const keys = Object.keys(to);
  const keyframeCount = resolveKeyframeCount(keys, to);
  if (keyframeCount <= 1) {
    builder.mark({ to, duration: totalDuration, ease: options?.ease });
    return;
  }

  builder.mark(buildKeyframeMarks(keys, to, keyframeCount, totalDuration, options));
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
