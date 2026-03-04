import { ComponentDef } from '../runtime/plugin';

export const MotionStateComponent: ComponentDef = {
  schema: {
    delay: 'float64',
    startTime: 'float64',
    pausedAt: 'float64',
    currentTime: 'float64',
    playbackRate: 'float32',
    status: 'int32', // 0: Idle, 1: Running, 2: Paused, 3: Finished
    iteration: 'int32',
    tickInterval: 'int32',
    tickPhase: 'int32',
    tickPriority: 'int32',
  },
};

export enum MotionStatus {
  Idle = 0,
  Running = 1,
  Paused = 2,
  Finished = 3,
}
