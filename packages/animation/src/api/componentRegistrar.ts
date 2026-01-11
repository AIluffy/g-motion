import {
  MotionStateComponent,
  RenderComponent,
  TimelineComponent,
  type World,
} from '@g-motion/core';
import { registerAnimationSystems } from '../index';

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
