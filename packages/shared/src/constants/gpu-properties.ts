import { TRANSFORM_TYPED_KEYS } from '../transform/constants';

export const GPU_CAPABLE_PROPERTIES = [...TRANSFORM_TYPED_KEYS, 'opacity'] as const;

export const STANDARD_GPU_CHANNEL_PROPERTIES = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'scaleY',
  'opacity',
] as const;

export const DEFAULT_HALF_FLOAT_COMPONENTS = [...TRANSFORM_TYPED_KEYS, 'opacity'] as const;
