/**
 * Core constants for Motion animation engine
 *
 * Centralizes magic numbers to improve code readability and maintainability
 */

/**
 * Archetype default settings
 */
export const ARCHETYPE_DEFAULTS = {
  /** Initial capacity for component buffers (balances memory and performance) */
  INITIAL_CAPACITY: 1024,
  /** Growth factor when resizing buffers (2x doubling strategy) */
  GROWTH_FACTOR: 2,
} as const;

/**
 * WebGPU workgroup size hints for optimal GPU utilization
 */
export const WEBGPU_WORKGROUPS = {
  /** Small batches (< 64 entities) */
  SMALL: 16,
  /** Medium batches (< 256 entities) */
  MEDIUM: 32,
  /** Large batches (< 1024 entities) */
  LARGE: 64,
  /** Extra large batches (>= 1024 entities) */
  XLARGE: 128,
} as const;

/**
 * Scheduler time limits
 */
export const SCHEDULER_LIMITS = {
  /**
   * Maximum frame delta time to prevent spiraling on lag spikes
   * (e.g., when tab is in background)
   */
  MAX_FRAME_TIME_MS: 100,
} as const;

/**
 * Batch buffer cache settings
 */
export const BATCH_BUFFER_CACHE = {
  /** Minimum buffer capacity to reduce frequent reallocations */
  MIN_BUFFER_SIZE: 1024,
} as const;
