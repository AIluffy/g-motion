import type { MotionValue } from '../motion-value';

export type AnimationTarget = Element | string | Record<string, unknown>;
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | ((value: number) => number);

export interface KeyframeInput {
  time: number;
  value: number;
  easing?: Easing;
  hold?: boolean;
}

export interface FromToInput {
  from: number;
  to: number;
  duration: number;
  easing?: Easing;
}

export type ChannelInput = number | number[] | MotionValue | KeyframeInput[] | FromToInput;
export type MotionProps = Record<string, ChannelInput>;

export interface MotionOptions {
  duration?: number;
  delay?: number;
  easing?: Easing;
  autoplay?: boolean;
  onComplete?: () => void;
  onUpdate?: (progress: number) => void;
}

export interface MotionController {
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  reverse(): void;
  value(key: string): MotionValue | undefined;
}

export type TimelineLayerConfig = {
  name: string;
  target: AnimationTarget;
  duration?: number;
  startTime?: number;
} & Record<string, unknown>;

export type TimelineConfig = {
  autoplay?: boolean;
  target?: AnimationTarget;
  duration?: number;
  layers?: TimelineLayerConfig[];
  markers?: Record<string, number>;
  workArea?: [number, number];
} & Record<string, unknown>;

export interface TimelineController {
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  seekToMarker(name: string): void;
  reverse(): void;
  timeValue(): MotionValue;
  progressValue(): MotionValue;
  readonly duration: number;
  readonly currentTime: number;
  readonly progress: number;
  playhead: number;
  workArea: [number, number];
}
