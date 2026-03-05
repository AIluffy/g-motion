export type { Plugin, PluginContext, WorldLike, EngineLike } from './plugin';
export {
  definePlugin,
  registerPlugin,
  getRegisteredPlugins,
  clearPluginRegistry,
  isPluginRegistered,
} from './plugin';
export type { MotionApp, MotionPlugin } from './plugin';

export type {
  TargetScopeRoot,
  SelectorCache,
  TargetResolveContext,
  TargetResolveResult,
  TargetResolver,
} from './target-resolver';
export {
  registerTargetResolver,
  registerTargetResolverWithScope,
  resolveWithRegisteredTargetResolvers,
} from './target-resolver';

export type { Disposable, FrameCallback, Priority } from './types';
