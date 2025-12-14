/**
 * Type definitions for ECS components to avoid 'unknown' type errors
 * These types provide type safety when accessing component buffers
 */

import { MotionStatus } from '@g-motion/core';

export interface MotionStateComponentData {
  status: MotionStatus;
  currentTime: number;
  iteration?: number;
  delay?: number;
  playbackRate: number;
  startTime: number;
}

export interface TimelineComponentData {
  duration: number;
  repeat?: number;
  loop?: boolean;
  tracks?: Map<string, unknown>;
}

export interface TransformComponentData {
  x?: number;
  y?: number;
  z?: number;
  translateX?: number;
  translateY?: number;
  translateZ?: number;
  rotate?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  skewX?: number;
  skewY?: number;
  perspective?: number;
}

export interface RenderComponentData {
  rendererId: string;
  target: unknown;
  props?: Record<string, unknown>;
}
