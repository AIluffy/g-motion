import { MotionStatus, SystemDef } from '../index';
import type { SystemContext } from '../index';

export const TimeSystem: SystemDef = {
  name: 'TimeSystem',
  order: 0,
  update(dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;

    if (!world) {
      return;
    }

    const config = ctx?.services.config ?? world.config;
    const globalSpeed = config.globalSpeed ?? 1;
    const samplingMode = config.samplingMode ?? 'time';
    const baseDt = samplingMode === 'frame' ? (ctx?.sampling?.deltaTimeMs ?? 0) : dt;
    const adjustedDt = baseDt * globalSpeed;

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      if (!stateBuffer) continue;
      if (archetype.getBuffer('Spring') || archetype.getBuffer('Inertia')) continue;

      // Pre-fetch typed buffers for MotionState numeric fields if available
      const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
      const typedDelay = archetype.getTypedBuffer('MotionState', 'delay');
      const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
      const typedStatus = archetype.getTypedBuffer('MotionState', 'status');

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as {
          status: MotionStatus;
          delay?: number;
          currentTime: number;
          playbackRate: number;
        };
        const status = typedStatus ? (typedStatus[i] as unknown as MotionStatus) : state.status;
        if (status === MotionStatus.Running) {
          const playbackRate = typedPlaybackRate ? typedPlaybackRate[i] : state.playbackRate;
          const remainingDelay = typedDelay ? typedDelay[i] : (state.delay ?? 0);
          const currentTime = typedCurrentTime ? typedCurrentTime[i] : state.currentTime;

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
            const nextTime = currentTime + usableDt * playbackRate;
            state.currentTime = nextTime;
            if (typedCurrentTime) typedCurrentTime[i] = nextTime;
            continue;
          }

          const nextTime = currentTime + adjustedDt * playbackRate;
          state.currentTime = nextTime;

          if (typedCurrentTime) typedCurrentTime[i] = nextTime;
        }
      }
    }
  },
};
