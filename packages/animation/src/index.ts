import {
  World,
  WorldProvider,
  TimeSystem,
  RenderSystem,
  BatchSamplingSystem,
  WebGPUComputeSystem,
  GPUResultApplySystem,
  ActiveEntityMonitorSystem,
  getEngineForWorld,
} from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { TimelineSystem } from './systems/timeline';
import { InterpolationSystem } from './systems/interpolation';
import { RovingResolverSystem } from './systems/rovingResolver';
import { motion as builderMotion } from './api/builder';

let initialized = false;
const debug = createDebugger('Animation');

function initEngine() {
  if (initialized) return;
  initialized = true;

  const world = WorldProvider.useWorld();
  getEngineForWorld(world);

  debug('Initializing engine, registering systems');
  registerAnimationSystems(world);
}

/**
 * Register animation systems into a specific World instance.
 * This enables per-world system registration for multi-world isolation.
 *
 * Note: All animations now default to GPU compute path with CPU fallback.
 * ThresholdMonitorSystem has been removed - GPU is always attempted first.
 */
export function registerAnimationSystems(world: World) {
  debug('Registering animation systems for world');
  world.scheduler.add(TimeSystem);
  world.scheduler.add(TimelineSystem);
  world.scheduler.add(RovingResolverSystem);
  world.scheduler.add(InterpolationSystem);
  world.scheduler.add(GPUResultApplySystem);
  world.scheduler.add(BatchSamplingSystem);
  world.scheduler.add(WebGPUComputeSystem);
  if ((ActiveEntityMonitorSystem as any)?.update) {
    world.scheduler.add(ActiveEntityMonitorSystem);
  }
  world.scheduler.add(RenderSystem);
}

export const motion = (target: any) => {
  initEngine();

  // CSS selector string: if multiple elements match, fan-out via batch
  if (typeof target === 'string' && typeof document !== 'undefined') {
    try {
      const nodeList = document.querySelectorAll(target);
      if (nodeList && nodeList.length > 1) {
        return builderMotion(Array.from(nodeList));
      }
      // fall through for 0/1 matches: use single builder; DOM renderer will resolve
    } catch {
      // Invalid selector — fall back to single builder; renderer may no-op
    }
  }

  // builderMotion now handles both single and array targets
  return builderMotion(target);
};

export * from './api/control';
export * from './api/builder';
export * from './api/gpu-status';
export * from './api/track';
export * from './api/adjust';
export * from './systems/gpu/packBuffers';
export { engine } from './engine';
