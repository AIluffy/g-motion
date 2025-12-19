import type { SystemContext } from '../plugin';
import { SystemDef } from '../plugin';

export const ActiveEntityMonitorSystem: SystemDef = {
  name: 'ActiveEntityMonitorSystem',
  order: 9,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) {
      return;
    }
    world.scheduler.setActiveEntityCount(world.getActiveMotionEntityCount());
  },
};
