export {
  EasingRegistry,
  getCustomEasingVersion,
  getCustomGpuEasings,
  getEasingId,
  globalEasingRegistry,
  registerGpuEasing,
} from './easing';
export type { EasingEntry } from './easing';

export { Registry, RegistryWithDefaults } from './collections';
export type { RegistryEntry, RegistryOptions } from './collections';

export { invariant, isFatalError, panic } from './error';
export type { MotionErrorContext } from './error';

export { createDebugger, debug, DebugController, globalDebugController, isDev } from './debug';
export type { DebugEnvironment, DebugLevel } from './debug';

export { FrameSampler } from './time/frame-sampler';
export type { FrameRoundingMode } from './time/frame-sampler';
export { getNowMs } from './time/now';

export { clamp, clamp01, lerp } from './math/interpolation';
export { NonNegativeRollingAverage } from './math/rolling-average';

export * from './types';
export * from './constants';

export { TimelineTracksMap } from './timeline';

/**
 * @deprecated 使用 @g-motion/shared/dom
 */
export {
  createDomTargetResolver,
  getDomEnvironment,
  resetDomEnvironment,
  resolveDomElements,
  setDomEnvironment,
} from './dom/target-resolver';
/** @deprecated 使用 @g-motion/shared/dom */
export type {
  DomEnvironment,
  DomResolvedTarget,
  DomTargetResolver,
  DomTargetResolverContext,
  NodeListLike,
} from './dom/target-resolver';
/** @deprecated 使用 @g-motion/shared/dom */
export { isArrayLike, isDomElement, isNodeList } from './dom/type-guards';

/** @deprecated 使用 @g-motion/shared/transform */
export {
  DEFAULT_HALF_FLOAT_COMPONENTS,
  EXCLUDED_STYLE_KEYS,
  GPU_CAPABLE_PROPERTIES,
  STANDARD_GPU_CHANNEL_PROPERTIES,
  TRANSFORM_KEYS,
  TRANSFORM_TYPED_KEYS,
} from './transform/constants';
/** @deprecated 使用 @g-motion/shared/transform */
export { buildTransformTypedBuffers } from './transform/typed-buffers';
/** @deprecated 使用 @g-motion/shared/transform */
export type { TransformTypedBuffers } from './transform/typed-buffers';
/** @deprecated 使用 @g-motion/shared/transform */
export type { Quaternion, Rotate3D, TransformOrigin, TransformProperties } from './transform/types';

/** @deprecated 使用 @g-motion/webgpu */
export { crc32 } from './stream/crc32';
/** @deprecated 使用 @g-motion/webgpu */
export { encodePackedFrame, PackedStreamDecoder } from './stream/packed-stream';
/** @deprecated 使用 @g-motion/webgpu */
export type { PackedFrame, PackedFrameHeader } from './stream/packed-stream';
