import type { MotionValue } from '../motion-value';

export type AnimationTarget = Element | string | Record<string, unknown>;
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | ((value: number) => number);

export interface Keyframe {
  time: number;
  value: number;
  easing?: Easing;
  hold?: boolean;
}

export interface KeyframeShorthand {
  t: number;
  v: number;
  e?: Easing;
  hold?: boolean;
}

export type KeyframeInput = Keyframe | KeyframeShorthand;

export interface FromToInput {
  from: number;
  to: number;
  duration: number;
  easing?: Easing;
}

export type ChannelInput = number | number[] | MotionValue | KeyframeInput[] | FromToInput;
export type MotionProps = Record<string, ChannelInput>;

export type ComposeConfig = {
  target?: AnimationTarget;
  duration?: number;
} & Record<string, unknown>;

export interface Composition {
  readonly kind: 'composition';
  readonly duration: number;
  readonly target?: AnimationTarget;
  readonly props: Readonly<MotionProps>;
}

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

export type TimelineLayerInputConfig = {
  name: string;
  target: AnimationTarget;
  duration?: number;
  startTime?: number;
  visible?: boolean;
  locked?: boolean;
} & Record<string, unknown>;

export type TimelineCompositionLayerConfig = {
  name: string;
  composition: Composition;
  target?: AnimationTarget;
  duration?: number;
  startTime?: number;
  visible?: boolean;
  locked?: boolean;
};

export type TimelineLayerConfig = TimelineLayerInputConfig | TimelineCompositionLayerConfig;

export type TimelineConfig = {
  autoplay?: boolean;
  target?: AnimationTarget;
  duration?: number;
  layers?: TimelineLayerConfig[];
  markers?: Record<string, number>;
  workArea?: [number, number];
} & Record<string, unknown>;

export interface AnimationLayerSnapshot {
  name: string;
  visible: boolean;
  locked: boolean;
  startTime: number;
  duration: number;
}

export interface AnimationTrackSnapshot {
  layer: string;
  property: string;
  keyframes: Keyframe[];
  currentValue: number;
  isMotionValue: boolean;
}

export interface AnimationStateSnapshot {
  duration: number;
  currentTime: number;
  progress: number;
  isPlaying: boolean;
  markers: Record<string, number>;
  workArea: [number, number];
  selectedLayer: string | null;
  layers: AnimationLayerSnapshot[];
  tracks: AnimationTrackSnapshot[];
}

export interface AnimationStateStore {
  getSnapshot(): AnimationStateSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface TrackController {
  getCurve(): Keyframe[];
  setCurve(keyframes: KeyframeInput[]): void;
  insertKeyframe(keyframe: KeyframeInput): void;
  removeKeyframe(time: number): void;
}

export interface LayerController {
  show(): void;
  hide(): void;
  lock(): void;
  unlock(): void;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly startTime: number;
  readonly duration: number;
  move(delta: number): void;
  track(property: string): TrackController;
}

export interface TimelineController {
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  seekToMarker(name: string): void;
  reverse(): void;
  layer(name: string): LayerController;
  bindState(): AnimationStateStore;
  timeValue(): MotionValue;
  progressValue(): MotionValue;
  readonly duration: number;
  readonly currentTime: number;
  readonly progress: number;
  playhead: number;
  workArea: [number, number];
}
