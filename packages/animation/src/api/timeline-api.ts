import type { AnimationOptions } from './animation-options';
import { motion } from '..';
import { AnimationControl } from './control';
import type { AnimatableProps, MotionTarget } from '../types/animation-target-types';

export type TimelineSegment<T extends MotionTarget = any> = [
  target: T,
  keyframes: AnimatableProps<T>,
  options?: SegmentOptions<AnimatableProps<T>>,
];

export interface SegmentOptions<TValue = any> extends AnimationOptions<TValue> {
  at?: number | string;
}

export interface TimelineOptions<TValue = any> {
  repeat?: number;
  repeatType?: 'loop' | 'reverse';
  paused?: boolean;
  defaults?: Partial<AnimationOptions<TValue>>;
  onComplete?: () => void;
  onUpdate?: (progress: number) => void;
}

type NormalizedSegment<T extends MotionTarget = any> = {
  target: T;
  keyframes: AnimatableProps<T>;
  options: SegmentOptions<AnimatableProps<T>>;
  startTime: number;
  endTime: number;
};

const DEFAULT_SEGMENT_DURATION = 300;

function parseRelativeAt(at: string, prevStart: number, prevEnd: number): number {
  const token = at.trim();
  if (token === '<') return prevStart;
  if (token === '>') return prevEnd;

  if (/^[+-]\d+(?:\.\d+)?$/.test(token)) {
    const delta = Number(token);
    return prevEnd + delta;
  }

  return prevEnd;
}

function resolveSegmentStart(
  at: number | string | undefined,
  prevStart: number,
  prevEnd: number,
): number {
  if (typeof at === 'number') return at;
  if (typeof at === 'string') return parseRelativeAt(at, prevStart, prevEnd);
  return prevEnd;
}

function resolveSegmentDuration(
  options: SegmentOptions | undefined,
  defaults?: Partial<AnimationOptions>,
): number {
  const d = options?.duration ?? defaults?.duration ?? DEFAULT_SEGMENT_DURATION;
  return Number.isFinite(d) ? Math.max(0, d as number) : DEFAULT_SEGMENT_DURATION;
}

function normalizeSegments(
  segments: TimelineSegment[],
  timelineOptions?: TimelineOptions,
): { normalized: NormalizedSegment[]; totalDuration: number } {
  const normalized: NormalizedSegment[] = [];
  let prevStart = 0;
  let prevEnd = 0;
  let totalDuration = 0;

  for (const [target, keyframes, segmentOptions] of segments) {
    const duration = resolveSegmentDuration(segmentOptions, timelineOptions?.defaults);
    const startTime = Math.max(0, resolveSegmentStart(segmentOptions?.at, prevStart, prevEnd));
    const endTime = startTime + duration;
    const options: SegmentOptions = {
      ...(timelineOptions?.defaults ?? {}),
      ...(segmentOptions ?? {}),
      duration,
    };

    normalized.push({
      target,
      keyframes,
      options,
      startTime,
      endTime,
    });

    prevStart = startTime;
    prevEnd = endTime;
    if (endTime > totalDuration) totalDuration = endTime;
  }

  return { normalized, totalDuration };
}

function createProgressTicker(
  totalDuration: number,
  onUpdate?: (progress: number) => void,
): () => void {
  if (!onUpdate || totalDuration <= 0) {
    return () => {};
  }

  const startAt = Date.now();
  let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
    const elapsed = Date.now() - startAt;
    const progress = Math.min(1, Math.max(0, elapsed / totalDuration));
    onUpdate(progress);
    if (progress >= 1 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 16);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function timeline(
  segments: TimelineSegment[],
  options?: TimelineOptions,
): AnimationControl & PromiseLike<void> {
  const { normalized, totalDuration } = normalizeSegments(segments, options);
  const controls: AnimationControl[] = [];
  const entityIds: number[] = [];

  const stopTicker = createProgressTicker(totalDuration, options?.onUpdate);

  for (const segment of normalized) {
    const control = motion(segment.target)
      .mark({
        to: segment.keyframes,
        duration: segment.options.duration,
        ease: segment.options.ease,
      })
      .option({
        delay: (segment.options.delay ?? 0) + segment.startTime,
        repeat: options?.repeat ?? segment.options.repeat,
        repeatType: options?.repeatType ?? segment.options.repeatType,
        direction: segment.options.direction,
        onUpdate: segment.options.onUpdate,
      })
      .play({
        onComplete: segment.options.onComplete,
      });

    controls.push(control);
    entityIds.push(...control.getEntityIds());
  }

  const aggregated = new AnimationControl(entityIds, controls, true);
  if (options?.onComplete) {
    AnimationControl.registerOnComplete(aggregated, options.onComplete);
  }

  void aggregated.finished.finally(() => {
    stopTicker();
    options?.onUpdate?.(1);
  });

  if (options?.paused) {
    aggregated.pause();
  }

  return aggregated as AnimationControl & PromiseLike<void>;
}

export const __timelineInternals = {
  normalizeSegments,
  resolveSegmentStart,
  parseRelativeAt,
};
