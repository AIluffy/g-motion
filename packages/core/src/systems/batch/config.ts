/**
 * Batch Processing Configuration
 *
 * Default constants and configuration values for batch processing.
 */

import { GPU_DEFAULTS } from '@g-motion/shared';

/**
 * Default maximum batch size per archetype
 */
export const DEFAULT_MAX_BATCH_SIZE = 1024;

/**
 * Available workgroup sizes for GPU compute dispatch
 * Adaptive selection based on entity count:
 * - ≤ 32 entities: WG=32
 * - ≤ 128 entities: WG=64
 * - ≤ 512 entities: WG=128
 * - > 512 entities: WG=256
 */
export const WORKGROUP_SIZES = [
  GPU_DEFAULTS.WORKGROUP.SIZE_SMALL,
  GPU_DEFAULTS.WORKGROUP.SIZE_MEDIUM,
  GPU_DEFAULTS.WORKGROUP.SIZE_DEFAULT,
  GPU_DEFAULTS.WORKGROUP.SIZE_XLARGE,
] as const;

/**
 * Workgroup selection thresholds
 */
export const WORKGROUP_THRESHOLDS = {
  [GPU_DEFAULTS.WORKGROUP.SIZE_SMALL]: GPU_DEFAULTS.WORKGROUP.ENTITY_COUNT_SMALL_THRESHOLD,
  [GPU_DEFAULTS.WORKGROUP.SIZE_MEDIUM]: GPU_DEFAULTS.WORKGROUP.ENTITY_COUNT_MEDIUM_THRESHOLD,
  [GPU_DEFAULTS.WORKGROUP.SIZE_DEFAULT]: GPU_DEFAULTS.WORKGROUP.ENTITY_COUNT_XLARGE_THRESHOLD,
  [GPU_DEFAULTS.WORKGROUP.SIZE_XLARGE]: Infinity,
} as const;
