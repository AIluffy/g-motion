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
} from '@g-motion/core';
import { GPUResultApplySystem, WebGPUComputeSystem } from '@g-motion/webgpu/orchestration';
import { createDebugger } from '@g-motion/shared';

const debug = createDebugger('Animation');

/**
 * Register animation systems into a specific World instance.
 * This enables per-world system registration for multi-world isolation.
 *
 * Note: All animations now default to GPU compute path.
 * ThresholdMonitorSystem has been removed - GPU is always attempted first.
 */
export function registerAnimationSystems(world: World) {
  debug('Registering animation systems for world');
  world.scheduler.add(TimeSystem);
  world.scheduler.add(TimelineSystem);
  world.scheduler.add(RovingResolverSystem);
  world.scheduler.add(BatchSamplingSystem);
  world.scheduler.add(WebGPUComputeSystem);
  world.scheduler.add(GPUResultApplySystem);
  world.scheduler.add(ActiveEntityMonitorSystem);
  world.scheduler.add(RenderSystem);
}

export class ComponentRegistrar {
  ensureAnimationSystemsRegistered(world: World): void {
    if ((world as any).__animationSystemsRegistered) {
      return;
    }
    registerAnimationSystems(world);
    (world as any).__animationSystemsRegistered = true;
  }

  registerCoreComponents(world: World): void {
    if (!world.registry.get('MotionState')) {
      world.registry.register('MotionState', MotionStateComponent);
    }
    if (!world.registry.get('Timeline')) {
      world.registry.register('Timeline', TimelineComponent);
    }
    if (!world.registry.get('Render')) {
      world.registry.register('Render', RenderComponent);
    }
  }
}
