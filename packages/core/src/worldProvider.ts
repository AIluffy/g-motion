import { World } from './world';

let defaultWorld: World | undefined;

export const WorldProvider = {
  setDefault(world: World) {
    defaultWorld = world;
  },
  useWorld(): World {
    // Return injected world if present; otherwise fallback to singleton
    if (defaultWorld) return defaultWorld;
    return World.get();
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
