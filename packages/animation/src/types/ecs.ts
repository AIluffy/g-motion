/**
 * Type definitions for ECS components to avoid 'unknown' type errors
 * These types provide type safety when accessing component buffers
 */

import { MotionStatus } from '@g-motion/core';
import type { TransformProperties } from '@g-motion/shared';

export interface MotionStateComponentData extends Record<string, unknown> {
  status: MotionStatus;
  currentTime: number;
  iteration?: number;
  delay?: number;
  playbackRate: number;
  startTime: number;
  tickInterval?: number;
  tickPhase?: number;
  tickPriority?: number;
}

export interface TransformComponentData extends TransformProperties, Record<string, unknown> {}

export interface RenderComponentData extends Record<string, unknown> {
  rendererId: string;
  rendererCode?: number;
  target: unknown;
  props?: Record<string, unknown>;
  version?: number;
  renderedVersion?: number;
}
