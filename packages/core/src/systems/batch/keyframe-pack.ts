import { getEasingId } from '@g-motion/shared';
import { EASING_MODE } from '@g-motion/webgpu';
import { MIN_GPU_KEYFRAME_DURATION } from './constants';

type EasingMode = (typeof EASING_MODE)[keyof typeof EASING_MODE];

export type KeyframeBezier = {
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
};

export interface KeyframeLike {
  startTime?: number;
  time?: number;
  startValue: number;
  endValue: number;
  easing?: unknown;
  interp?: string;
  bezier?: KeyframeBezier;
}

export function packSingleKeyframe(kf: KeyframeLike, buffer: Float32Array, offset: number): void {
  const easingName = kf.easing ? (kf.easing as string) : 'linear';
  const easingId = getEasingId(easingName);
  let easingMode: EasingMode = EASING_MODE.STANDARD;
  if (kf.interp === 'hold') easingMode = EASING_MODE.HOLD;
  else if (kf.bezier || kf.interp === 'bezier') easingMode = EASING_MODE.BEZIER;

  const startTime = kf.startTime ?? 0;
  const duration = (kf.time ?? 0) - startTime;
  buffer[offset] = startTime;
  buffer[offset + 1] = duration > 0 ? duration : MIN_GPU_KEYFRAME_DURATION;
  buffer[offset + 2] = kf.startValue;
  buffer[offset + 3] = kf.endValue;
  buffer[offset + 4] = easingId;
  buffer[offset + 5] = kf.bezier?.cx1 ?? 0;
  buffer[offset + 6] = kf.bezier?.cy1 ?? 0;
  buffer[offset + 7] = kf.bezier?.cx2 ?? 1;
  buffer[offset + 8] = kf.bezier?.cy2 ?? 1;
  buffer[offset + 9] = easingMode;
}
