/**
 * @g-motion/core — 公开 API 主入口
 *
 * 本文件仅暴露面向外部消费者的高频 API。
 * 内部实现细节请通过 sub-path exports 访问：
 *
 *   @g-motion/core/ecs       — ECS 原语（Archetype、Registry、EntityManager）
 *   @g-motion/core/runtime   — 运行时细节（AppContext、easing/gpu registry 等）
 *   @g-motion/core/systems   — 所有系统（含 renderer-group-cache）
 *   @g-motion/core/components — 组件定义
 *   @g-motion/core/scheduler — SystemScheduler
 *   @g-motion/core/batch     — BatchSamplingSystem 及批处理细节
 *   @g-motion/core/webgpu-systems — WebGPU 系统（已废弃桥接层）
 */

// ─── 核心运行时 ────────────────────────────────────────────────────────────────

export { World } from './runtime/world';
export type { MotionStatusListener } from './runtime/world';

export { WorldProvider } from './runtime/world-provider';

export { createEngine, getDefaultEngine, getEngineForWorld } from './runtime/engine';
export type { MotionEngine, EngineResetOptions } from './runtime/engine';

// ─── 插件系统 ──────────────────────────────────────────────────────────────────

export {
  registerPlugin,
  isPluginRegistered,
  getRegisteredPlugins,
  clearPluginRegistry,
} from './runtime/plugin-registry';

export type {
  MotionPlugin,
  MotionApp,
  MotionAppConfig,
  NormalizedMotionAppConfig,
  EngineServices,
  SystemContext,
  SystemDef,
  RendererDef,
  ComponentDef,
  ComponentValue,
  ComponentType,
  PluginManifest,
  PluginComponentDef,
  ShaderModuleDef,
  PluginConfig,
  ShaderDef,
  ShaderBindingDef,
  RendererBatchContext,
} from './runtime/plugin';

// ─── 平台 & 目标注册 ───────────────────────────────────────────────────────────

export { registerPlatformProvider, getPlatformCapabilities } from './runtime/platform-registry';

export {
  registerTargetResolver,
  registerTargetResolverWithScope,
  resolveWithRegisteredTargetResolvers,
} from './runtime/target-resolver';

export type {
  SelectorCache,
  TargetResolveContext,
  TargetResolveResult,
  TargetResolver,
  TargetScopeRoot,
} from './runtime/target-resolver';

// ─── 渲染器 ────────────────────────────────────────────────────────────────────

export { getRendererCode, getRendererName } from './render/renderer-code';

// ─── 核心组件 ──────────────────────────────────────────────────────────────────

export { MotionStateComponent, MotionStatus } from './components/state';
export { TimelineComponent } from './components/timeline/index';
export { RenderComponent } from './components/render';

export type {
  TimelineData,
  Keyframe,
  Track,
  SpringParams,
  InertiaParams,
  SpringOptions,
  InertiaOptions,
} from './components/timeline/index';

// ─── 核心系统 ──────────────────────────────────────────────────────────────────

export { TimeSystem, computeStartTimeForTimelineTime } from './systems/time';
export { TimelineSystem } from './systems/timeline';
export { RenderSystem } from './systems/render';
export { RovingResolverSystem } from './systems/roving-resolver';
export { ActiveEntityMonitorSystem } from './systems/active-entity-monitor';
export { BatchSamplingSystem, markBatchSamplingSeekInvalidation } from './systems/batch';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

export * from './constants';
