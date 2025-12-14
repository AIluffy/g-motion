import { SystemDef, MotionStatus } from '../index';
import { WorldProvider } from '../worldProvider';

export const TimeSystem: SystemDef = {
  name: 'TimeSystem',
  order: 0,
  update(dt: number) {
    const world = WorldProvider.useWorld();

    // Apply global speed multiplier if set
    const globalSpeed = (world.config as any).globalSpeed ?? 1;
    const adjustedDt = dt * globalSpeed;

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      if (!stateBuffer) continue;

      // Pre-fetch typed buffers for MotionState numeric fields if available
      const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
      const typedDelay = archetype.getTypedBuffer('MotionState', 'delay');

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as {
          status: MotionStatus;
          delay?: number;
          currentTime: number;
          playbackRate: number;
        };
        if (state.status === MotionStatus.Running) {
          const remainingDelay = state.delay ?? 0;

          // Consume delay first; carry any leftover time into the animation clock.
          if (remainingDelay > 0) {
            const newDelay = remainingDelay - adjustedDt;

            if (newDelay > 0) {
              state.delay = newDelay;
              if (typedDelay) typedDelay[i] = newDelay;
              continue;
            }

            state.delay = 0;
            if (typedDelay) typedDelay[i] = 0;
            const usableDt = adjustedDt - remainingDelay;
            state.currentTime += usableDt * state.playbackRate;
            if (typedCurrentTime) typedCurrentTime[i] = state.currentTime;
            continue;
          }

          state.currentTime += adjustedDt * state.playbackRate;
          if (typedCurrentTime) typedCurrentTime[i] = state.currentTime;
        }
      }
    }
  },
};
