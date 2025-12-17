import { SystemDef, MotionStatus, WorldProvider } from '@g-motion/core';

export const TimelineSystem: SystemDef = {
  name: 'TimelineSystem',
  order: 10,
  update() {
    const world = WorldProvider.useWorld();
    let activeCount = 0;

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const springBuffer = archetype.getBuffer('Spring');

      if (!stateBuffer || !timelineBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as {
          status: MotionStatus;
          currentTime: number;
          iteration?: number;
        };
        const timeline = timelineBuffer[i] as {
          duration: number;
          repeat?: number;
          loop?: boolean;
        };

        if (state.status === MotionStatus.Running) {
          activeCount++;
        }

        if (state.status !== MotionStatus.Running) continue;

        // Skip duration check for spring-based animations
        // Spring animations are physics-driven and complete when reaching rest state
        const hasSpring = springBuffer && springBuffer[i];
        if (hasSpring) {
          continue; // Let SpringSystem handle completion
        }

        // For non-spring animations, check duration-based completion
        if (state.currentTime >= timeline.duration) {
          const maxRepeat = timeline.repeat ?? (timeline.loop ? -1 : 0);
          const currentIteration = state.iteration || 0;

          if (maxRepeat === -1 || currentIteration < maxRepeat) {
            state.currentTime %= timeline.duration;
            state.iteration = currentIteration + 1;
          } else {
            state.currentTime = timeline.duration;
            state.status = MotionStatus.Finished;
            activeCount--; // This entity just finished
          }
        }
      }
    }

    // Update scheduler with active entity count
    world.scheduler.setActiveEntityCount(activeCount);
  },
};
