/**
 * Core constants for Motion animation engine
 *
 * Centralizes magic numbers to improve code readability and maintainability
 */

import { WebGPUConstants } from '@g-motion/shared';

export const SchedulingConstants = {
  MAX_FRAME_TIME_MS: 100,
  DEFAULT_SAMPLING_FPS: 60,
  DEFAULT_KEYFRAME_INTERVAL_MS: 16,
  FRAME_BUDGET_MS_DEFAULT: 12,
  WORK_SLICING_ENABLED: true,
} as const;

/**
 * Archetype default settings
 */
export const ARCHETYPE_DEFAULTS = {
  /** Initial capacity for component buffers (balances memory and performance) */
  INITIAL_CAPACITY: 1024,
  /** Growth factor when resizing buffers (2x doubling strategy) */
  GROWTH_FACTOR: 2,
} as const;

export { WebGPUConstants };

/**
 * WebGPU workgroup size hints for optimal GPU utilization
 */
export const WEBGPU_WORKGROUPS = {
  SMALL: WebGPUConstants.WORKGROUP.SIZE_SMALL,
  MEDIUM: WebGPUConstants.WORKGROUP.SIZE_MEDIUM,
  LARGE: WebGPUConstants.WORKGROUP.SIZE_LARGE,
  XLARGE: WebGPUConstants.WORKGROUP.SIZE_XLARGE,
} as const;

/**
 * Scheduler time limits
 */
export const SCHEDULER_LIMITS = {
  /**
   * Maximum frame delta time to prevent spiraling on lag spikes
   * (e.g., when tab is in background)
   */
  MAX_FRAME_TIME_MS: SchedulingConstants.MAX_FRAME_TIME_MS,
} as const;

/**
 * Batch buffer cache settings
 */
export const BATCH_BUFFER_CACHE = {
  /** Minimum buffer capacity to reduce frequent reallocations */
  MIN_BUFFER_SIZE: 1024,
} as const;
