export type { Plugin, PluginContext, WorldLike, EngineLike } from './plugin';
export { definePlugin } from './plugin';
export type { MotionApp, MotionPlugin } from './plugin';

export type {
  TargetScopeRoot,
  SelectorCache,
  TargetResolveContext,
  TargetResolveResult,
  TargetResolver,
} from './target-resolver';

export type { Disposable, FrameCallback, Priority } from './types';

export type {
  ArchetypeView,
  RendererBatchContext,
  RendererDef,
  SystemContext,
  SystemDef,
  WorldView,
} from './system';
export type { ComponentDef, ComponentType, ComponentValue, BatchContext } from './component';
export type {
  GPUBridge,
  GPUResultQueueCapability,
  GPUWorkgroupCapability,
  GPUPhysicsCapability,
  GPUChannelCapability,
  GPUBufferCapability,
  GPUComputeCapability,
  GPUInitResult,
  GPUBatchRequest,
  GPUPhysicsBatchRequest,
  GPUResultEntry,
  GPUMetrics,
} from './gpu-bridge';

export type { PlatformCapabilities, PlatformProvider } from './platform';
export type { ShaderBindingDef, ShaderDef } from './shader';
export type {
  Easing,
  MotionStatusValue,
  Keyframe,
  Track,
  TimelineData,
  TransformData,
  RenderData,
  MotionStateData,
  TimelineComponentData,
  VelocityData,
} from './animation';
export { MotionStatus } from './animation';
export type {
  SpringOptions,
  InertiaOptions,
  SpringComponentData,
  InertiaComponentData,
} from './physics';
export type {
  PreprocessedKeyframes,
  BatchDescriptor,
  LeasedBatchDescriptor,
  WorkgroupBatchDescriptor,
  KeyframePreprocessBatchDescriptor,
  ViewportCullingBatchDescriptor,
} from './batch';
export type { ComputeProvider, ComputeProviderFactory } from './compute';
