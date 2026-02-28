/**
 * Batch Processing Configuration
 *
 * Default constants and configuration values for batch processing.
 */

import { WebGPUConstants } from '@g-motion/shared';

/**
 * Default maximum batch size per archetype
 */
export const DEFAULT_MAX_BATCH_SIZE = 1024;

/**
 * Available workgroup sizes for GPU compute dispatch
 * Adaptive selection based on entity count:
 * - < 64 entities: WG=16
 * - < 256 entities: WG=32
 * - < 1024 entities: WG=64
 * - >= 1024 entities: WG=128
 */
export const WORKGROUP_SIZES = [
  WebGPUConstants.WORKGROUP.SIZE_SMALL,
  WebGPUConstants.WORKGROUP.SIZE_MEDIUM,
  WebGPUConstants.WORKGROUP.SIZE_DEFAULT,
  WebGPUConstants.WORKGROUP.SIZE_XLARGE,
] as const;

/**
 * Workgroup selection thresholds
 */
export const WORKGROUP_THRESHOLDS = {
  [WebGPUConstants.WORKGROUP.SIZE_SMALL]: WebGPUConstants.WORKGROUP.ENTITY_COUNT_SMALL_THRESHOLD,
  [WebGPUConstants.WORKGROUP.SIZE_MEDIUM]: WebGPUConstants.WORKGROUP.ENTITY_COUNT_MEDIUM_THRESHOLD,
  [WebGPUConstants.WORKGROUP.SIZE_DEFAULT]: WebGPUConstants.WORKGROUP.ENTITY_COUNT_XLARGE_THRESHOLD,
  [WebGPUConstants.WORKGROUP.SIZE_XLARGE]: Infinity,
} as const;
