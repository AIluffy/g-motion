export const TRANSFORM_KEYS = [
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'skewX',
  'skewY',
  'perspective',
] as const;

export const TRANSFORM_TYPED_KEYS = [
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'perspective',
] as const;

export const DOM_TRANSFORM_KEYS = [...TRANSFORM_KEYS] as const;

export const GPU_CAPABLE_PROPERTIES = [
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'perspective',
  'opacity',
] as const;

export const STANDARD_GPU_CHANNEL_PROPERTIES = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'scaleY',
  'opacity',
] as const;

export const DEFAULT_HALF_FLOAT_COMPONENTS = [
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'rotateX',
  'rotateY',
  'rotateZ',
  'rotate',
  'scaleX',
  'scaleY',
  'scaleZ',
  'scale',
  'opacity',
] as const;

const EXCLUDED_STYLE_KEY_LIST = [
  '__primitive',
  'transform',
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'scaleX',
  'scaleY',
  'scaleZ',
  'scale',
  'perspective',
] as const;

export const EXCLUDED_STYLE_KEYS: Record<string, true> = Object.fromEntries(
  EXCLUDED_STYLE_KEY_LIST.map((key) => [key, true]),
) as Record<string, true>;
