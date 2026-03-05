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

export type { SystemDef, SystemContext, RendererDef, RendererBatchContext } from './system';
export type { ComponentDef, ComponentType, ComponentValue, BatchContext } from './component';
export type {
  GPUBridge,
  GPUComputeCapability,
  GPUInitResult,
  GPUBatchRequest,
  GPUPhysicsBatchRequest,
  GPUResultEntry,
  GPUMetrics,
} from './gpu-bridge';

export type {
  SpringOptions,
  InertiaOptions,
  SpringComponentData,
  InertiaComponentData,
} from './physics';
