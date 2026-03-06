import type { SystemContext } from '../runtime/plugin';
import { SystemDef } from '../runtime/plugin';

export const ActiveEntityMonitorSystem: SystemDef = {
  name: 'ActiveEntityMonitorSystem',
  order: 9,
  phase: 'postUpdate',
  reads: ['world.getActiveMotionEntityCount'],
  writes: ['scheduler.setActiveEntityCount'],
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) {
      return;
    }
    world.scheduler.setActiveEntityCount(world.getActiveMotionEntityCount());
  },
};
