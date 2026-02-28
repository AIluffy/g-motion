import { World } from './world';

let defaultWorld: World | undefined;

export const WorldProvider = {
  setDefault(world: World) {
    defaultWorld = world;
  },
  useWorld(): World {
    if (!defaultWorld) {
      defaultWorld = new World();
    }
    return defaultWorld;
  },
  withWorld<T>(world: World, fn: (world: World) => T): T {
    const prev = defaultWorld;
    defaultWorld = world;
    try {
      return fn(world);
    } finally {
      defaultWorld = prev;
    }
  },
  reset() {
    defaultWorld = undefined;
  },
};
