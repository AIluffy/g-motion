import type { InertiaOptions, SpringOptions } from './physics';

export type Easing = string;

export const MotionStatus = {
  Idle: 0,
  Running: 1,
  Paused: 2,
  Completed: 3,
  Cancelled: 4,
} as const;

export type MotionStatusValue = (typeof MotionStatus)[keyof typeof MotionStatus];

export interface Keyframe {
  startTime: number;
  time: number;
  startValue: number;
  endValue: number;
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier' | 'spring' | 'inertia';
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  easing?: Easing;
  spring?: SpringOptions;
  inertia?: InertiaOptions;
}

export type Track = Keyframe[];
export type TimelineData = Map<string, Track>;
export type TransformData = Record<string, number | string | undefined>;

export interface RenderData {
  rendererId: string;
  rendererCode?: number;
  target: unknown;
  props?: Record<string, number>;
  version?: number;
  renderedVersion?: number;
}

export interface MotionStateData {
  status: MotionStatusValue;
  startTime: number;
  currentTime: number;
  playbackRate: number;
  iteration?: number;
  delay?: number;
  pausedAt?: number;
  tickInterval?: number;
  tickPhase?: number;
  tickPriority?: number;
}

export interface TimelineComponentData {
  tracks?: TimelineData;
  duration?: number;
  loop?: number | boolean;
  repeat?: number;
  version?: number;
  rovingApplied?: number;
}

export interface VelocityData {
  values: number[];
  timestamps: number[];
  velocity: number;
  rafId?: number;
}
