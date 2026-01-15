import { MotionStatus } from '../components/state';
import type { SystemContext, SystemDef } from '../plugin';
import { getNowMs } from '../utils';

export const TimeSystem: SystemDef = {
  name: 'TimeSystem',
  order: 0,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;

    if (!world) {
      return;
    }

    const nowMs = typeof ctx?.nowMs === 'number' ? ctx.nowMs : getNowMs();

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      if (!stateBuffer || !timelineBuffer) continue;
      if (archetype.getBuffer('Spring') || archetype.getBuffer('Inertia')) continue;

      const typedStartTime = archetype.getTypedBuffer('MotionState', 'startTime');
      const typedPausedAt = archetype.getTypedBuffer('MotionState', 'pausedAt');
      const typedDelay = archetype.getTypedBuffer('MotionState', 'delay');
      const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
      const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
      const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
      const typedIteration = archetype.getTypedBuffer('MotionState', 'iteration');

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as {
          status: MotionStatus;
          startTime: number;
          pausedAt?: number;
          delay?: number;
          playbackRate?: number;
          currentTime?: number;
          iteration?: number;
        };
        const status = typedStatus ? (typedStatus[i] as unknown as MotionStatus) : state.status;
        if (
          status !== MotionStatus.Running &&
          status !== MotionStatus.Paused &&
          status !== MotionStatus.Finished
        ) {
          continue;
        }

        const startTime = typedStartTime ? typedStartTime[i] : Number(state.startTime ?? 0);
        const pausedAt = typedPausedAt ? typedPausedAt[i] : Number(state.pausedAt ?? 0);
        const delay = typedDelay ? typedDelay[i] : Number(state.delay ?? 0);
        const playbackRate = typedPlaybackRate
          ? typedPlaybackRate[i]
          : Number(state.playbackRate ?? 1);
        const timeline = timelineBuffer[i] as {
          duration?: number;
          repeat?: number;
          loop?: number | boolean;
        };
        const duration = Number(timeline.duration ?? 0);
        const loop = timeline.loop;
        const repeat = timeline.repeat;

        const res = evaluateMotionTime({
          nowMs,
          startTime,
          pausedAt,
          delay,
          playbackRate,
          duration,
          loop,
          repeat,
        });

        state.currentTime = res.timelineTime;
        state.iteration = res.iteration;
        if (typedCurrentTime) typedCurrentTime[i] = res.timelineTime;
        if (typedIteration) typedIteration[i] = res.iteration;

        if (res.finished && status === MotionStatus.Running) {
          world.setMotionStatusAt(archetype, i, MotionStatus.Finished);
        }
      }
    }
  },
};

export function evaluateTimelineTimeRaw(params: {
  nowMs: number;
  startTime: number;
  pausedAt?: number;
  delay?: number;
  playbackRate?: number;
}): number {
  const pausedAt = Number(params.pausedAt ?? 0);
  const effectiveNow = pausedAt ? Math.min(params.nowMs, pausedAt) : params.nowMs;
  const startTime = Number(params.startTime ?? 0);
  const delay = Number(params.delay ?? 0);
  const playbackRate = Number(params.playbackRate ?? 1);
  return (effectiveNow - startTime - delay) * playbackRate;
}

function mod(n: number, d: number): number {
  const r = n % d;
  return r < 0 ? r + d : r;
}

export function evaluateMotionTime(params: {
  nowMs: number;
  startTime: number;
  pausedAt?: number;
  delay?: number;
  playbackRate?: number;
  duration: number;
  loop?: number | boolean;
  repeat?: number;
}): { timelineTime: number; iteration: number; finished: boolean } {
  const duration = Number(params.duration ?? 0);
  if (!(Number.isFinite(duration) && duration > 0)) {
    return { timelineTime: 0, iteration: 0, finished: true };
  }

  const playbackRate = Number(params.playbackRate ?? 1);
  const direction = playbackRate < 0 ? -1 : 1;
  const rateAbs = Math.abs(playbackRate);

  const pausedAt = Number(params.pausedAt ?? 0);
  const effectiveNow = pausedAt ? Math.min(params.nowMs, pausedAt) : params.nowMs;
  const startTime = Number(params.startTime ?? 0);
  const delay = Number(params.delay ?? 0);
  const delta = effectiveNow - startTime - delay;
  if (delta < 0) {
    return { timelineTime: delta * rateAbs, iteration: 0, finished: false };
  }

  const distanceTime = delta * rateAbs;

  const maxRepeat = Number.isFinite(Number(params.repeat))
    ? Number(params.repeat)
    : params.loop
      ? -1
      : 0;
  const finiteRepeat = maxRepeat >= 0;

  const iteration = Math.floor(distanceTime / duration);
  const finished = finiteRepeat && iteration > maxRepeat;
  if (finished) {
    return { timelineTime: direction > 0 ? duration : 0, iteration, finished: true };
  }

  const wrappedDistance = mod(distanceTime, duration);
  const timelineTime =
    direction > 0 ? wrappedDistance : wrappedDistance === 0 ? duration : duration - wrappedDistance;
  return { timelineTime, iteration, finished: false };
}

export function computeStartTimeForTimelineTime(params: {
  nowMs: number;
  pausedAt?: number;
  delay?: number;
  playbackRate?: number;
  duration: number;
  timelineTime: number;
}): number {
  const pausedAt = Number(params.pausedAt ?? 0);
  const effectiveNow = pausedAt ? Math.min(params.nowMs, pausedAt) : params.nowMs;
  const delay = Number(params.delay ?? 0);
  const duration = Number(params.duration ?? 0);
  const playbackRate = Number(params.playbackRate ?? 1);
  const rateAbs = Math.abs(playbackRate);
  if (!(Number.isFinite(duration) && duration > 0) || !(Number.isFinite(rateAbs) && rateAbs > 0)) {
    return effectiveNow - delay;
  }

  const clampedTime = Math.max(0, Math.min(Number(params.timelineTime ?? 0), duration));
  const distanceTime =
    playbackRate < 0 ? (clampedTime >= duration ? 0 : duration - clampedTime) : clampedTime;
  return effectiveNow - delay - distanceTime / rateAbs;
}
