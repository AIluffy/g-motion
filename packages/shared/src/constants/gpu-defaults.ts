/**
 * GPU defaults shared across packages.
 *
 * Keep this module free of WebGPU runtime dependencies so core can use
 * the same defaults without depending on @g-motion/webgpu.
 */
export const GPU_DEFAULTS = {
  WORKGROUP: {
    SIZE_DEFAULT: 128,
    SIZE_SMALL: 32,
    SIZE_MEDIUM: 64,
    SIZE_LARGE: 128,
    SIZE_XLARGE: 256,
    ENTITY_COUNT_XLARGE_THRESHOLD: 512,
    ENTITY_COUNT_SMALL_THRESHOLD: 32,
    ENTITY_COUNT_MEDIUM_THRESHOLD: 128,
  },
  GPU: {
    TAIL_KEEP_ALIVE_MS: 250,
    PHYSICS_MAX_VELOCITY_DEFAULT: 10000,
    PHYSICS_SETTLE_THRESHOLD_DEFAULT: 0.001,
  },
} as const;
