import { SystemDef, SystemContext, MotionStatus } from '@g-motion/core';

export const TimelineSystem: SystemDef = {
  name: 'TimelineSystem',
  order: 10,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) {
      return;
    }

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const springBuffer = archetype.getBuffer('Spring');
      const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
      const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
      const typedIteration = archetype.getTypedBuffer('MotionState', 'iteration');
      const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');

      if (!stateBuffer || !timelineBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as {
          status: MotionStatus;
          currentTime: number;
          iteration?: number;
          playbackRate?: number;
        };
        const timeline = timelineBuffer[i] as {
          duration: number;
          repeat?: number;
          loop?: boolean;
        };

        const status = typedStatus ? (typedStatus[i] as unknown as MotionStatus) : state.status;
        if (status !== MotionStatus.Running) continue;

        const currentTime = typedCurrentTime ? typedCurrentTime[i] : state.currentTime;
        const playbackRate = typedPlaybackRate ? typedPlaybackRate[i] : (state.playbackRate ?? 1);

        // Skip duration check for spring-based animations
        // Spring animations are physics-driven and complete when reaching rest state
        const hasSpring = springBuffer && springBuffer[i];
        if (hasSpring) {
          continue; // Let SpringSystem handle completion
        }

        const duration = timeline.duration ?? 0;
        if (!(Number.isFinite(duration) && duration > 0)) {
          state.currentTime = 0;
          if (typedCurrentTime) typedCurrentTime[i] = 0;
          world.setMotionStatusAt(archetype, i, MotionStatus.Finished);
          continue;
        }

        const maxRepeat = timeline.repeat ?? (timeline.loop ? -1 : 0);
        const currentIteration = typedIteration ? typedIteration[i] : state.iteration || 0;

        if (playbackRate < 0) {
          if (currentTime <= 0) {
            if (maxRepeat === -1 || currentIteration < maxRepeat) {
              const mod = ((currentTime % duration) + duration) % duration;
              const nextTime = mod === 0 ? duration : mod;
              const nextIteration = currentIteration + 1;
              state.currentTime = nextTime;
              state.iteration = nextIteration;
              if (typedCurrentTime) typedCurrentTime[i] = nextTime;
              if (typedIteration) typedIteration[i] = nextIteration;
            } else {
              state.currentTime = 0;
              if (typedCurrentTime) typedCurrentTime[i] = 0;
              world.setMotionStatusAt(archetype, i, MotionStatus.Finished);
            }
          } else if (currentTime > duration) {
            state.currentTime = duration;
            if (typedCurrentTime) typedCurrentTime[i] = duration;
          }
        } else {
          if (currentTime >= duration) {
            if (maxRepeat === -1 || currentIteration < maxRepeat) {
              const nextTime = currentTime % duration;
              const nextIteration = currentIteration + 1;
              state.currentTime = nextTime;
              state.iteration = nextIteration;
              if (typedCurrentTime) typedCurrentTime[i] = nextTime;
              if (typedIteration) typedIteration[i] = nextIteration;
            } else {
              state.currentTime = duration;
              if (typedCurrentTime) typedCurrentTime[i] = duration;
              world.setMotionStatusAt(archetype, i, MotionStatus.Finished);
            }
          } else if (currentTime < 0) {
            state.currentTime = 0;
            if (typedCurrentTime) typedCurrentTime[i] = 0;
          }
        }
      }
    }
  },
};
