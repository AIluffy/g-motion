import type { Easing } from '@g-motion/shared';

export interface AnimationOptions {
  duration?: number;
  delay?: number;
  ease?: Easing;
  repeat?: number;
  repeatType?: 'loop' | 'reverse';
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  onUpdate?: (latest: any) => void;
  onComplete?: () => void;
}
