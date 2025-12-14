import { World, MotionStatus, WorldProvider } from '@g-motion/core';

export class AnimationControl {
  private entityIds: number[];
  private controls: AnimationControl[];
  private isBatch: boolean;
  private injectedWorld?: World;

  private getWorld(): World {
    return this.injectedWorld ?? WorldProvider.useWorld();
  }

  constructor(
    entityId: number | number[],
    controls?: AnimationControl[],
    isBatch = false,
    world?: World,
  ) {
    if (Array.isArray(entityId)) {
      this.entityIds = entityId;
      this.controls = controls || [];
      this.isBatch = isBatch;
    } else {
      this.entityIds = [entityId];
      this.controls = [];
      this.isBatch = false;
    }
    this.injectedWorld = world;
  }

  /** For backward compatibility - get primary entity ID */
  private get entityId(): number {
    return this.entityIds[0];
  }

  stop() {
    if (this.isBatch && this.controls.length > 0) {
      // Batch operation
      for (const control of this.controls) {
        control.stop();
      }
      return;
    }

    const world = this.getWorld();
    for (const entityId of this.entityIds) {
      const archetype = world.getEntityArchetype(entityId);
      if (!archetype) continue;

      const state = archetype.getEntityData(entityId, 'MotionState');
      if (state) {
        state.status = MotionStatus.Finished;
      }
    }
  }

  pause() {
    if (this.isBatch && this.controls.length > 0) {
      // Batch operation
      for (const control of this.controls) {
        control.pause();
      }
      return;
    }

    const world = this.getWorld();
    for (const entityId of this.entityIds) {
      const archetype = world.getEntityArchetype(entityId);
      if (!archetype) continue;

      const state = archetype.getEntityData(entityId, 'MotionState');
      if (state && state.status === MotionStatus.Running) {
        state.status = MotionStatus.Paused;
        state.pausedAt = performance.now();
      }
    }
  }

  play() {
    if (this.isBatch && this.controls.length > 0) {
      // Batch operation
      for (const control of this.controls) {
        control.play();
      }
      return;
    }

    const world = this.getWorld();
    for (const entityId of this.entityIds) {
      const archetype = world.getEntityArchetype(entityId);
      if (!archetype) continue;

      const state = archetype.getEntityData(entityId, 'MotionState');
      if (state) {
        if (state.status === MotionStatus.Paused && state.pausedAt) {
          // Shift startTime forward by the paused duration so GPU elapsed stays accurate.
          const pausedDuration = performance.now() - state.pausedAt;
          state.startTime += pausedDuration;
          state.pausedAt = 0;
        }
        state.status = MotionStatus.Running;
        // Ensure scheduler is running when animation is resumed
        world.scheduler.ensureRunning();
      }
    }
  }

  /** Reverse playback direction using negative playbackRate. */
  reverse() {
    if (this.isBatch && this.controls.length > 0) {
      for (const control of this.controls) {
        control.reverse();
      }
      return;
    }

    const world = this.getWorld();
    for (const entityId of this.entityIds) {
      const archetype = world.getEntityArchetype(entityId);
      if (!archetype) continue;
      const state = archetype.getEntityData(entityId, 'MotionState');
      const timeline = archetype.getEntityData(entityId, 'Timeline');
      if (!state || !timeline) continue;

      // If playbackRate is positive, negate; if zero, set to -1
      const currentRate = state.playbackRate ?? 1;
      const newRate = currentRate === 0 ? -1 : -Math.abs(currentRate);
      state.playbackRate = newRate;

      // Ensure we are running
      state.status = MotionStatus.Running;
      if (typeof (world.scheduler as any).ensureRunning === 'function') {
        (world.scheduler as any).ensureRunning();
      } else {
        world.scheduler.start();
      }
    }
  }

  /** Check if current playback is reversed (negative playbackRate) */
  isReversed(): boolean {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return false;
    const state = archetype.getEntityData(this.entityId, 'MotionState');
    const rate = state?.playbackRate ?? 1;
    return rate < 0;
  }

  /** Seek to an absolute time (ms) on the timeline. */
  seek(timeMs: number) {
    if (this.isBatch && this.controls.length > 0) {
      for (const control of this.controls) {
        control.seek(timeMs);
      }
      return;
    }

    const world = this.getWorld();
    for (const entityId of this.entityIds) {
      const archetype = world.getEntityArchetype(entityId);
      if (!archetype) continue;

      const state = archetype.getEntityData(entityId, 'MotionState');
      const timeline = archetype.getEntityData(entityId, 'Timeline');
      if (!state || !timeline) continue;

      const clamped = Math.max(0, Math.min(timeMs, timeline.duration ?? 0));
      state.currentTime = clamped;
    }
  }

  /** Get current absolute time (ms) on the timeline. */
  getCurrentTime(): number {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return 0;
    const state = archetype.getEntityData(this.entityId, 'MotionState');
    return state?.currentTime ?? 0;
  }

  /** Get total duration (ms) of the timeline. */
  getDuration(): number {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return 0;
    const timeline = archetype.getEntityData(this.entityId, 'Timeline');
    return timeline?.duration ?? 0;
  }

  /** Set playback rate (1 = normal speed). */
  setPlaybackRate(rate: number) {
    if (this.isBatch && this.controls.length > 0) {
      for (const control of this.controls) {
        control.setPlaybackRate(rate);
      }
      return;
    }

    const world = this.getWorld();
    for (const entityId of this.entityIds) {
      const archetype = world.getEntityArchetype(entityId);
      if (!archetype) continue;
      const state = archetype.getEntityData(entityId, 'MotionState');
      if (state && Number.isFinite(rate) && rate > 0) {
        state.playbackRate = rate;
      }
    }
  }

  /** Get playback rate (1 = normal speed). */
  getPlaybackRate(): number {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return 1;
    const state = archetype.getEntityData(this.entityId, 'MotionState');
    return state?.playbackRate ?? 1;
  }

  /** Convenience: set FPS by mapping to playbackRate relative to 60fps. */
  setFps(fps: number) {
    if (!Number.isFinite(fps) || fps <= 0) return;
    // Map desired fps to playbackRate assuming 60fps baseline
    const rate = fps / 60;
    this.setPlaybackRate(rate);
  }

  /** Convenience: get effective FPS from playbackRate (baseline 60). */
  getFps(): number {
    return (this.getPlaybackRate() || 1) * 60;
  }

  /** Get the entity IDs in this animation (or batch) */
  getEntityIds(): number[] {
    return [...this.entityIds];
  }

  /** Get individual controls if this is a batch animation */
  getControls(): AnimationControl[] {
    return [...this.controls];
  }

  /** Get count of entities in this animation */
  getCount(): number {
    return this.entityIds.length;
  }

  /** Check if this is a batch animation */
  isBatchAnimation(): boolean {
    return this.isBatch;
  }

  /**
   * Clean up animation and optionally remove entities
   * @param removeEntities - Whether to remove entities from world (default: true)
   */
  destroy(removeEntities = true): void {
    // Stop all animations first
    this.stop();

    if (removeEntities) {
      const world = this.getWorld();
      for (const entityId of this.entityIds) {
        const archetype = world.getEntityArchetype(entityId);
        if (archetype) {
          world.markForDeletion([entityId]);
        }
      }
      world.flushDeletions();
    }

    // Clear references
    this.controls.length = 0;
    this.entityIds.length = 0;
  }
}
