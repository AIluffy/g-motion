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
