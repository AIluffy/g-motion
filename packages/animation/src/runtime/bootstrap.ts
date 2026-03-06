import {
  ActiveEntityMonitorSystem,
  BatchSamplingSystem,
  MotionStateComponent,
  RenderComponent,
  RenderSystem,
  RovingResolverSystem,
  TimelineComponent,
  TimelineSystem,
  TimeSystem,
  World,
  getEngineForWorld,
} from '@g-motion/core';
import { AppContext, WorldProvider } from '@g-motion/core/runtime';
import { getNowMs } from '@g-motion/shared';
import { createDOMPlugin } from '@g-motion/plugin-dom';

import { AnimationBindingComponent, AnimationFacadeSystem } from './facade-system';

type RuntimeBootstrap = ReturnType<typeof createBootstrap>;

let bootstrap: RuntimeBootstrap | undefined;

function registerCoreFacade(engine: RuntimeBootstrap['engine']): void {
  const { app } = engine;

  app.registerComponent('MotionState', MotionStateComponent);
  app.registerComponent('Timeline', TimelineComponent);
  app.registerComponent('Render', RenderComponent);
  app.registerComponent('AnimationBinding', AnimationBindingComponent);

  app.registerSystem(TimeSystem);
  app.registerSystem(TimelineSystem);
  app.registerSystem(RovingResolverSystem);
  app.registerSystem(BatchSamplingSystem);
  app.registerSystem(ActiveEntityMonitorSystem);
  app.registerSystem(AnimationFacadeSystem);
  app.registerSystem(RenderSystem);

  engine.use(createDOMPlugin() as Parameters<typeof engine.use>[0]);
}

function createBootstrap() {
  const world = World.create();
  WorldProvider.setDefault(world);
  const engine = getEngineForWorld(world);
  engine.services.world = world;

  registerCoreFacade(engine);

  return {
    engine,
    world,
  };
}

export function ensureAnimationRuntime() {
  if (!bootstrap) {
    bootstrap = createBootstrap();
  }
  return bootstrap;
}

export function flushAnimationRuntimeFrame(nowMs = getNowMs()): void {
  const runtime = ensureAnimationRuntime();
  const services = {
    ...runtime.engine.services,
    world: runtime.world,
  };
  const ctx = {
    services,
    nowMs,
  };

  AnimationFacadeSystem.update(0, ctx);
  RenderSystem.update(0, ctx);
}

export function flushAnimationRenderFrame(nowMs = getNowMs()): void {
  const runtime = ensureAnimationRuntime();
  const services = {
    ...runtime.engine.services,
    world: runtime.world,
  };
  const ctx = {
    services,
    nowMs,
  };

  RenderSystem.update(0, ctx);
}

export function resetAnimationRuntimeForTests(): void {
  bootstrap?.engine.dispose();
  bootstrap = undefined;
  AppContext.reset();
  WorldProvider.reset();
}
