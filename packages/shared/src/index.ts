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

export {
  createDomTargetResolver,
  getDomEnvironment,
  resetDomEnvironment,
  resolveDomElements,
  setDomEnvironment,
} from './dom/target-resolver';
export type {
  DomEnvironment,
  DomResolvedTarget,
  DomTargetResolver,
  DomTargetResolverContext,
  NodeListLike,
} from './dom/target-resolver';
export { isArrayLike, isDomElement, isNodeList } from './dom/type-guards';

export { crc32 } from './stream/crc32';
export { encodePackedFrame, PackedStreamDecoder } from './stream/packed-stream';
export type { PackedFrame, PackedFrameHeader } from './stream/packed-stream';

export * from './types';

export * from './constants';

export {
  DEFAULT_HALF_FLOAT_COMPONENTS,
  EXCLUDED_STYLE_KEYS,
  GPU_CAPABLE_PROPERTIES,
  STANDARD_GPU_CHANNEL_PROPERTIES,
  TRANSFORM_KEYS,
  TRANSFORM_TYPED_KEYS,
} from './transform/constants';
export { buildTransformTypedBuffers } from './transform/typed-buffers';
export type { TransformTypedBuffers } from './transform/typed-buffers';
export type { Quaternion, Rotate3D, TransformOrigin, TransformProperties } from './transform/types';

export { TimelineTracksMap } from './timeline';
