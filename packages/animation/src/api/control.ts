import { World, MotionStatus, WorldProvider } from '@g-motion/core';
import type { MotionStateComponentData, TimelineComponentData } from '../component-types';
import { FrameSampler } from './frameSampler';

export class AnimationControl {
  private static entityToControl = new Map<number, AnimationControl>();
  private static controlOnComplete = new WeakMap<AnimationControl, () => void>();
  private static controlFinishedEntities = new WeakMap<AnimationControl, Set<number>>();
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

  private forEachControl(single: () => void, batch?: (control: AnimationControl) => void): void {
    if (this.isBatch && this.controls.length > 0 && batch) {
      for (const control of this.controls) {
        batch(control);
      }
      return;
    }
    single();
  }

  /** For backward compatibility - get primary entity ID */
  private get entityId(): number {
    return this.entityIds[0];
  }

  stop() {
    this.forEachControl(
      () => {
        const world = this.getWorld();
        for (const entityId of this.entityIds) {
          world.setMotionStatus(entityId, MotionStatus.Finished);
        }
      },
      (control) => control.stop(),
    );
  }

  pause() {
    this.forEachControl(
      () => {
        const world = this.getWorld();
        for (const entityId of this.entityIds) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;

          const state = archetype.getEntityData(
            entityId,
            'MotionState',
          ) as MotionStateComponentData & {
            pausedAt?: number;
          };
          if (state && state.status === MotionStatus.Running) {
            state.pausedAt = performance.now();
            world.setMotionStatus(entityId, MotionStatus.Paused);
          }
        }
      },
      (control) => control.pause(),
    );
  }

  play() {
    this.forEachControl(
      () => {
        const world = this.getWorld();
        for (const entityId of this.entityIds) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;

          const state = archetype.getEntityData(
            entityId,
            'MotionState',
          ) as MotionStateComponentData & {
            pausedAt?: number;
          };
          if (state) {
            if (state.status === MotionStatus.Paused && state.pausedAt) {
              const pausedDuration = performance.now() - state.pausedAt;
              state.startTime += pausedDuration;
              state.pausedAt = 0;
              const index = (archetype as any).getInternalEntityIndices?.().get(entityId);
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
        }
      },
      (control) => control.play(),
    );
  }

  /** Reverse playback direction using negative playbackRate. */
  reverse() {
    this.forEachControl(
      () => {
        const world = this.getWorld();
        for (const entityId of this.entityIds) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;
          const state = archetype.getEntityData(
            entityId,
            'MotionState',
          ) as MotionStateComponentData;
          const timeline = archetype.getEntityData(entityId, 'Timeline') as TimelineComponentData;
          if (!state || !timeline) continue;

          const currentRate = state.playbackRate ?? 1;
          const newRate = currentRate === 0 ? -1 : -Math.abs(currentRate);
          state.playbackRate = newRate;
          const index = (archetype as any).getInternalEntityIndices?.().get(entityId);
          if (index !== undefined) {
            const typedPlaybackRate = archetype.getTypedBuffer('MotionState', 'playbackRate');
            if (typedPlaybackRate) typedPlaybackRate[index] = newRate;
          }

          world.setMotionStatus(entityId, MotionStatus.Running);
          if (typeof (world.scheduler as any).ensureRunning === 'function') {
            (world.scheduler as any).ensureRunning();
          } else {
            world.scheduler.start();
          }
        }
      },
      (control) => control.reverse(),
    );
  }

  /** Check if current playback is reversed (negative playbackRate) */
  isReversed(): boolean {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return false;
    const state = archetype.getEntityData(this.entityId, 'MotionState') as
      | MotionStateComponentData
      | undefined;
    const rate = state?.playbackRate ?? 1;
    return rate < 0;
  }

  /** Seek to an absolute time (ms) on the timeline. */
  seek(timeMs: number) {
    this.forEachControl(
      () => {
        const world = this.getWorld();
        for (const entityId of this.entityIds) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;

          const state = archetype.getEntityData(
            entityId,
            'MotionState',
          ) as MotionStateComponentData;
          const timeline = archetype.getEntityData(entityId, 'Timeline') as TimelineComponentData;
          if (!state || !timeline) continue;

          const clamped = Math.max(0, Math.min(timeMs, timeline.duration ?? 0));
          state.currentTime = clamped;
          const index = (archetype as any).getInternalEntityIndices?.().get(entityId);
          if (index !== undefined) {
            const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
            if (typedCurrentTime) typedCurrentTime[index] = clamped;
          }
        }
      },
      (control) => control.seek(timeMs),
    );
  }

  seekFrame(framePosition: number, fps?: number) {
    this.forEachControl(
      () => {
        const world = this.getWorld();
        const resolvedFps = this.getResolvedFps(fps);
        const sampler = new FrameSampler(resolvedFps);

        for (const entityId of this.entityIds) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;

          const state = archetype.getEntityData(
            entityId,
            'MotionState',
          ) as MotionStateComponentData;
          const timeline = archetype.getEntityData(entityId, 'Timeline') as TimelineComponentData;
          if (!state || !timeline) continue;

          const duration = timeline.duration ?? 0;
          const timeMs = sampler.seekTimeByFrame(framePosition, {
            clampMs: { min: 0, max: duration },
          });
          state.currentTime = timeMs;

          const index = (archetype as any).getInternalEntityIndices?.().get(entityId);
          if (index !== undefined) {
            const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
            if (typedCurrentTime) typedCurrentTime[index] = timeMs;
          }
        }
      },
      (control) => control.seekFrame(framePosition, fps),
    );
  }

  /** Get current absolute time (ms) on the timeline. */
  getCurrentTime(): number {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return 0;
    const state = archetype.getEntityData(this.entityId, 'MotionState') as
      | MotionStateComponentData
      | undefined;
    return state?.currentTime ?? 0;
  }

  getFramePosition(fps?: number): number {
    const resolvedFps = this.getResolvedFps(fps);
    const sampler = new FrameSampler(resolvedFps);
    return sampler.timeToFramePosition(this.getCurrentTime());
  }

  getFrameIndex(fps?: number): number {
    const resolvedFps = this.getResolvedFps(fps);
    const sampler = new FrameSampler(resolvedFps);
    return sampler.timeToFrameIndex(this.getCurrentTime(), 'floor');
  }

  private getResolvedFps(fps?: number): number {
    const world = this.getWorld();
    const config = world.config as any;
    return fps ?? config.samplingFps ?? config.targetFps ?? 60;
  }

  /** Get total duration (ms) of the timeline. */
  getDuration(): number {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return 0;
    const timeline = archetype.getEntityData(this.entityId, 'Timeline') as
      | TimelineComponentData
      | undefined;
    return timeline?.duration ?? 0;
  }

  /** Set playback rate (1 = normal speed). */
  setPlaybackRate(rate: number) {
    this.forEachControl(
      () => {
        const world = this.getWorld();
        for (const entityId of this.entityIds) {
          const archetype = world.getEntityArchetype(entityId);
          if (!archetype) continue;
          const state = archetype.getEntityData(
            entityId,
            'MotionState',
          ) as MotionStateComponentData;
          if (state && Number.isFinite(rate)) {
            state.playbackRate = rate;
            const index = (archetype as any).getInternalEntityIndices?.().get(entityId);
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

  /** Get playback rate (1 = normal speed). */
  getPlaybackRate(): number {
    const world = this.getWorld();
    const archetype = world.getEntityArchetype(this.entityId);
    if (!archetype) return 1;
    const state = archetype.getEntityData(this.entityId, 'MotionState') as
      | MotionStateComponentData
      | undefined;
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

  static registerOnComplete(control: AnimationControl, onComplete?: () => void): void {
    if (!onComplete) return;
    this.controlOnComplete.set(control, onComplete);
    const ids = control.getEntityIds();
    for (const id of ids) {
      this.entityToControl.set(id, control);
    }
    this.controlFinishedEntities.set(control, new Set());
  }

  static clearCompletionForControl(control: AnimationControl): void {
    this.controlOnComplete.delete(control);
    this.controlFinishedEntities.delete(control);
    const ids = control.getEntityIds();
    for (const id of ids) {
      this.entityToControl.delete(id);
    }
  }

  static handleMotionStatusChange(
    entityId: number,
    prevStatus: MotionStatus | undefined,
    nextStatus: MotionStatus,
  ): void {
    if (nextStatus !== MotionStatus.Finished || prevStatus === MotionStatus.Finished) {
      return;
    }
    const control = this.entityToControl.get(entityId);
    if (!control) return;
    const onComplete = this.controlOnComplete.get(control);
    if (!onComplete) return;
    let finished = this.controlFinishedEntities.get(control);
    if (!finished) {
      finished = new Set<number>();
      this.controlFinishedEntities.set(control, finished);
    }
    finished.add(entityId);
    if (finished.size >= control.getCount()) {
      this.clearCompletionForControl(control);
      detachControlFromScopes(control);
      try {
        onComplete();
      } catch {}
    }
  }
}

export type DomAnimationScope = {
  root: Element;
  animations: AnimationControl[];
};

function detachControlFromScopes(control: AnimationControl): void {
  const anyControl = control as any;
  const scopes: Set<DomAnimationScope> | undefined = anyControl.__domScopes;
  if (!scopes) return;
  for (const s of scopes) {
    const idx = s.animations.indexOf(control);
    if (idx !== -1) {
      s.animations.splice(idx, 1);
    }
  }
  scopes.clear();
}

export function registerControlWithScope(
  scope: DomAnimationScope,
  control: AnimationControl,
): void {
  if (!scope.animations.includes(control)) {
    scope.animations.push(control);
  }
  const anyControl = control as any;
  if (!anyControl.__domScopes) {
    anyControl.__domScopes = new Set<DomAnimationScope>();
    const originalDestroy = control.destroy.bind(control);
    anyControl.destroy = (removeEntities?: boolean) => {
      detachControlFromScopes(control);
      AnimationControl.clearCompletionForControl(control);
      return originalDestroy(removeEntities);
    };
  }
  anyControl.__domScopes.add(scope);
}

export function disposeScope(scope: DomAnimationScope): void {
  const animations = [...scope.animations];
  scope.animations.length = 0;
  for (const control of animations) {
    try {
      AnimationControl.clearCompletionForControl(control);
      control.stop();
    } catch {}
  }
}

export function disposeScopeHard(scope: DomAnimationScope, removeEntities = true): void {
  const animations = [...scope.animations];
  scope.animations.length = 0;
  for (const control of animations) {
    try {
      AnimationControl.clearCompletionForControl(control);
      control.destroy(removeEntities);
    } catch {}
  }
}
