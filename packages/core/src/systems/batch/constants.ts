/**
 * Batch Sampling Constants
 *
 * Easing mode constants matching shader EASING_MODE and performance tuning parameters.
 */

// Easing mode constants (matching shader EASING_MODE)
export const EASING_MODE_STANDARD = 0;
export const EASING_MODE_BEZIER = 1;
export const EASING_MODE_HOLD = 2;

// Performance tuning constants
export const MAX_KEYFRAMES_PER_CHANNEL = 4;
export const MIN_GPU_KEYFRAME_DURATION = 0.0001;

// Keyframe stride (10 floats per keyframe for Bezier support)
export const KEYFRAME_FLOATS = 10;
