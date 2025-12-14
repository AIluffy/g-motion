// Motion API Contract
// This defines the public surface area of the library.

/**
 * The main entry point.
 * @param target The object, element, or selector to animate.
 */
export function motion(target: MotionTarget): MotionBuilder;

export type MotionTarget =
  | string // Selector
  | Element // DOM Element
  | object // JS Object
  | number // Raw number (wrapper)
  | Array<any>; // Batch

export interface MotionBuilder {
  /**
   * Adds an animation step.
   * @param options Animation definition.
   */
  mark(options: MotionKeyframe): this;

  /**
   * Starts the animation.
   * @param config Global playback config.
   */
  animate(config?: MotionConfig): AnimationControl;
}

export interface MotionKeyframe {
  to: MotionValues; // Target values
  duration?: number; // ms
  delay?: number; // ms
  easing?: EasingString; // "linear", "easeIn", etc.
  [key: string]: any; // Allow plugin extensions
}

export interface MotionValues {
  [key: string]: number | string | MotionValues; // Recursive for deep objects
}

export interface MotionConfig {
  delay?: number;
  repeat?: number; // -1 for infinite
  yoyo?: boolean;
  onComplete?: () => void;
  onUpdate?: (values: any) => void;
}

export interface AnimationControl {
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  readonly progress: number; // 0-1
  readonly finished: Promise<void>;
}

export type EasingString = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | string;
