import { MotionStatus } from '@g-motion/core';
import type { MotionStateComponentData, TimelineComponentData } from '../../component-types';
import type { BatchCoordinator } from './batchCoordinator';

export class PlaybackController {
  constructor(private coordinator: BatchCoordinator) {}

  stop(): void {
    this.coordinator.forEachControl(
      () => {
        const world = this.coordinator.getWorld();
        for (const entityId of this.coordinator.getEntityIdView()) {
          world.setMotionStatus(entityId, MotionStatus.Finished);
        }
      },
      (control) => control.stop(),
    );
  }

  pause(): void {
    this.coordinator.forEachControl(
      () => {
        const world = this.coordinator.getWorld();
        for (const entityId of this.coordinator.getEntityIdView()) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;

          const state = archetype.getEntityData(entityId, 'MotionState') as
            | (MotionStateComponentData & { pausedAt?: number })
            | undefined;

          if (state && state.status === MotionStatus.Running) {
            state.pausedAt = performance.now();
            world.setMotionStatus(entityId, MotionStatus.Paused);
          }
        }
      },
      (control) => control.pause(),
    );
  }

  play(): void {
    this.coordinator.forEachControl(
      () => {
        const world = this.coordinator.getWorld();
        for (const entityId of this.coordinator.getEntityIdView()) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;

          const state = archetype.getEntityData(entityId, 'MotionState') as
            | (MotionStateComponentData & { pausedAt?: number })
            | undefined;

          if (!state) continue;

          if (state.status === MotionStatus.Paused && state.pausedAt) {
            const pausedDuration = performance.now() - state.pausedAt;
            state.startTime += pausedDuration;
            state.pausedAt = 0;

            const index = archetype.getInternalEntityIndices().get(entityId);
            if (index !== undefined) {
              const typedStartTime = archetype.getTypedBuffer('MotionState', 'startTime');
              if (typedStartTime) typedStartTime[index] = state.startTime;
              const typedPausedAt = archetype.getTypedBuffer('MotionState', 'pausedAt');
              if (typedPausedAt) typedPausedAt[index] = 0;
            }
          }

          world.setMotionStatus(entityId, MotionStatus.Running);
          world.scheduler.ensureRunning();
        }
      },
      (control) => control.play(),
    );
  }

  reverse(): void {
    this.coordinator.forEachControl(
      () => {
        const world = this.coordinator.getWorld();
        for (const entityId of this.coordinator.getEntityIdView()) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;
          const state = archetype.getEntityData(entityId, 'MotionState') as
            | MotionStateComponentData
            | undefined;
          const timeline = archetype.getEntityData(entityId, 'Timeline') as
            | TimelineComponentData
            | undefined;
          if (!state || !timeline) continue;

          const currentRate = state.playbackRate ?? 1;
          const newRate = currentRate === 0 ? -1 : -Math.abs(currentRate);
          state.playbackRate = newRate;
          const index = archetype.getInternalEntityIndices().get(entityId);
          if (index !== undefined) {
            const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
            if (typedPlaybackRate) typedPlaybackRate[index] = newRate;
          }

          world.setMotionStatus(entityId, MotionStatus.Running);
          world.scheduler.ensureRunning();
        }
      },
      (control) => control.reverse(),
    );
  }

  setPlaybackRate(rate: number): void {
    this.coordinator.forEachControl(
      () => {
        const world = this.coordinator.getWorld();
        for (const entityId of this.coordinator.getEntityIdView()) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;
          const state = archetype.getEntityData(entityId, 'MotionState') as
            | MotionStateComponentData
            | undefined;
          if (state && Number.isFinite(rate)) {
            state.playbackRate = rate;
            const index = archetype.getInternalEntityIndices().get(entityId);
            if (index !== undefined) {
              const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
              if (typedPlaybackRate) typedPlaybackRate[index] = rate;
            }
          }
        }
      },
      (control) => control.setPlaybackRate(rate),
    );
  }

  isReversed(primaryEntityId: number): boolean {
    const world = this.coordinator.getWorld();
    const archetype = world.getEntityArchetype(primaryEntityId);
    if (!archetype) return false;
    const state = archetype.getEntityData(primaryEntityId, 'MotionState') as
      | MotionStateComponentData
      | undefined;
    const rate = state?.playbackRate ?? 1;
    return rate < 0;
  }

  getPlaybackRate(primaryEntityId: number): number {
    const world = this.coordinator.getWorld();
    const archetype = world.getEntityArchetype(primaryEntityId);
    if (!archetype) return 1;
    const state = archetype.getEntityData(primaryEntityId, 'MotionState') as
      | MotionStateComponentData
      | undefined;
    return state?.playbackRate ?? 1;
  }
}
