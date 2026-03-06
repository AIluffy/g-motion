import { MotionStatus } from '../components/state';
import { SystemContext, SystemDef } from '../runtime/plugin';
import { getNowMs } from '@g-motion/shared';

function mod(n: number, d: number): number {
  const r = n % d;
  return r < 0 ? r + d : r;
}

export const TimelineSystem: SystemDef = {
  name: 'TimelineSystem',
  order: 4,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) {
      return;
    }
    const nowMs = typeof ctx?.nowMs === 'number' ? ctx.nowMs : getNowMs();

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
      const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
      const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
      const typedStartTime = archetype.getTypedBuffer('MotionState', 'startTime');
      const typedPausedAt = archetype.getTypedBuffer('MotionState', 'pausedAt');
      const typedDelay = archetype.getTypedBuffer('MotionState', 'delay');

      if (!stateBuffer || !timelineBuffer) continue;
      if (archetype.getBuffer('Spring') || archetype.getBuffer('Inertia')) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as {
          status: MotionStatus;
          currentTime: number;
          iteration?: number;
          playbackRate?: number;
          startTime?: number;
          pausedAt?: number;
          delay?: number;
        };
        const timeline = timelineBuffer[i] as {
          duration: number;
          repeat?: number;
          loop?: number | boolean;
        };

        const status = typedStatus ? (typedStatus[i] as unknown as MotionStatus) : state.status;
        if (
          status !== MotionStatus.Running &&
          status !== MotionStatus.Paused &&
          status !== MotionStatus.Finished
        ) {
          continue;
        }

        const currentTimeRaw = typedCurrentTime ? typedCurrentTime[i] : state.currentTime;
        const playbackRate = typedPlaybackRate ? typedPlaybackRate[i] : (state.playbackRate ?? 1);

        const duration = timeline.duration ?? 0;
        if (!(Number.isFinite(duration) && duration > 0)) {
          archetype.setField('MotionState', 'currentTime', i, 0);
          archetype.setField('MotionState', 'iteration', i, 0);
          world.setMotionStatusAt(archetype, i, MotionStatus.Finished);
          continue;
        }

        const currentTime = Number(currentTimeRaw ?? 0);
        if (!Number.isFinite(currentTime)) {
          continue;
        }

        const startTime = typedStartTime ? typedStartTime[i] : Number(state.startTime ?? 0);
        const pausedAt = typedPausedAt ? typedPausedAt[i] : Number(state.pausedAt ?? 0);
        const delay = typedDelay ? typedDelay[i] : Number(state.delay ?? 0);
        const pausedAtNum = Number(pausedAt ?? 0);
        const effectiveNow = pausedAtNum ? Math.min(nowMs, pausedAtNum) : nowMs;
        const deltaStart = effectiveNow - Number(startTime ?? 0) - Number(delay ?? 0);

        if (deltaStart < 0) {
          archetype.setField('MotionState', 'iteration', i, 0);
          continue;
        }

        const maxRepeat = Number.isFinite(Number(timeline.repeat))
          ? Number(timeline.repeat)
          : timeline.loop
            ? -1
            : 0;
        const finiteRepeat = maxRepeat >= 0;

        const playbackRateNum = Number(playbackRate ?? 1);
        const direction = playbackRateNum < 0 ? -1 : 1;
        let distanceTime = direction > 0 ? currentTime : duration - currentTime;
        if (!Number.isFinite(distanceTime)) distanceTime = 0;
        if (distanceTime < 0) distanceTime = 0;

        const iteration = Math.floor(distanceTime / duration);
        const finished = finiteRepeat && iteration > maxRepeat;

        const wrappedDistance = finished ? 0 : mod(distanceTime, duration);
        const timelineTime = finished
          ? direction > 0
            ? duration
            : 0
          : direction > 0
            ? wrappedDistance
            : wrappedDistance === 0
              ? duration
              : duration - wrappedDistance;

        archetype.setField('MotionState', 'currentTime', i, timelineTime);
        archetype.setField('MotionState', 'iteration', i, iteration);

        if (status === MotionStatus.Running && finished) {
          world.setMotionStatusAt(archetype, i, MotionStatus.Finished);
        }
      }
    }
  },
};
