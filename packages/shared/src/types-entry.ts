/**
 * Type-only subpath entry for @g-motion/shared/types.
 *
 * This module intentionally exports types only so it can be imported with
 * zero runtime payload.
 */

export type * from './types';
export type { TransformTypedBuffers } from './transform/typed-buffers';
export type { Quaternion, Rotate3D, TransformOrigin, TransformProperties } from './transform/types';

export type TransformKey = (typeof import('./transform/constants').TRANSFORM_KEYS)[number];
export type TransformTypedKey =
  (typeof import('./transform/constants').TRANSFORM_TYPED_KEYS)[number];
export type GpuCapableProperty =
  (typeof import('./transform/constants').GPU_CAPABLE_PROPERTIES)[number];
export type StandardGpuChannelProperty =
  (typeof import('./transform/constants').STANDARD_GPU_CHANNEL_PROPERTIES)[number];
export type WebGPUConstantsShape = typeof import('./constants/webgpu').WebGPUConstants;
