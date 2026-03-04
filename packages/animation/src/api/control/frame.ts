import type { MotionAppConfig } from '@g-motion/core';
import type { TimelineComponentData } from '@g-motion/shared';
import { markBatchSamplingSeekInvalidation } from '@g-motion/core';
import type { MotionStateComponentData } from '../../types/ecs';
import { FrameSampler } from '@g-motion/shared';
import type { BatchCoordinator } from './batch';

export class FrameNavigator {
  constructor(private coordinator: BatchCoordinator) {}

  seek(timeMs: number): void {
    this.coordinator.forEachControl(
      () => {
        markBatchSamplingSeekInvalidation();
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

          const clamped = Math.max(0, Math.min(timeMs, timeline.duration ?? 0));
          state.currentTime = clamped;

          const index = archetype.getInternalEntityIndices().get(entityId);
          if (index !== undefined) {
            const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
            if (typedCurrentTime) typedCurrentTime[index] = clamped;
          }
        }
      },
      (control) => control.seek(timeMs),
    );
  }

  seekFrame(framePosition: number, fps?: number): void {
    this.coordinator.forEachControl(
      () => {
        markBatchSamplingSeekInvalidation();
        const world = this.coordinator.getWorld();
        const resolvedFps = this.getResolvedFps(fps);
        const sampler = new FrameSampler(resolvedFps);

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

          const duration = timeline.duration ?? 0;
          const timeMs = sampler.seekTimeByFrame(framePosition, {
            clampMs: { min: 0, max: duration },
          });
          state.currentTime = timeMs;

          const index = archetype.getInternalEntityIndices().get(entityId);
          if (index !== undefined) {
            const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
            if (typedCurrentTime) typedCurrentTime[index] = timeMs;
          }
        }
      },
      (control) => control.seekFrame(framePosition, fps),
    );
  }

  getCurrentTime(primaryEntityId: number): number {
    const world = this.coordinator.getWorld();
    const archetype = world.getEntityArchetype(primaryEntityId);
    if (!archetype) return 0;
    const state = archetype.getEntityData(primaryEntityId, 'MotionState') as
      | MotionStateComponentData
      | undefined;
    const t = state?.currentTime ?? 0;
    return t < 0 ? 0 : t;
  }

  getDuration(primaryEntityId: number): number {
    const world = this.coordinator.getWorld();
    const archetype = world.getEntityArchetype(primaryEntityId);
    if (!archetype) return 0;
    const timeline = archetype.getEntityData(primaryEntityId, 'Timeline') as
      | TimelineComponentData
      | undefined;
    return timeline?.duration ?? 0;
  }

  getFramePosition(primaryEntityId: number, fps?: number): number {
    const resolvedFps = this.getResolvedFps(fps);
    const sampler = new FrameSampler(resolvedFps);
    return sampler.timeToFramePosition(this.getCurrentTime(primaryEntityId));
  }

  getFrameIndex(primaryEntityId: number, fps?: number): number {
    const resolvedFps = this.getResolvedFps(fps);
    const sampler = new FrameSampler(resolvedFps);
    return sampler.timeToFrameIndex(this.getCurrentTime(primaryEntityId), 'floor');
  }

  getResolvedFps(fps?: number): number {
    const world = this.coordinator.getWorld();
    const config: MotionAppConfig = world.config;
    return fps ?? config.samplingFps ?? config.targetFps ?? 60;
  }
}
