/**
 * Batch Processing Configuration
 *
 * Default constants and configuration values for batch processing.
 */

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
export const WORKGROUP_SIZES = [16, 32, 64, 128] as const;

/**
 * Workgroup selection thresholds
 */
export const WORKGROUP_THRESHOLDS = {
  16: 64,
  32: 256,
  64: 1024,
  128: Infinity,
} as const;
