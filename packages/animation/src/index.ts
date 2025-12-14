import {
  World,
  TimeSystem,
  RenderSystem,
  BatchSamplingSystem,
  WebGPUComputeSystem,
  ThresholdMonitorSystem,
  GPUResultApplySystem,
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

  const world = World.get();
  debug('Initializing engine, registering systems');
  // Register threshold monitor first to decide GPU eligibility
  world.scheduler.add(ThresholdMonitorSystem);
  world.scheduler.add(TimeSystem);
  world.scheduler.add(TimelineSystem);
  world.scheduler.add(RovingResolverSystem);
  world.scheduler.add(InterpolationSystem);
  // Apply GPU results before final render
  world.scheduler.add(GPUResultApplySystem);
  // Register GPU batch systems for high-load scenarios
  world.scheduler.add(BatchSamplingSystem);
  world.scheduler.add(WebGPUComputeSystem);
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
