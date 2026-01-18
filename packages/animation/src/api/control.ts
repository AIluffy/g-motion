import { MotionStatus } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import type { World } from '@g-motion/core';
import { BatchCoordinator } from './control/batchCoordinator';
import { AnimationCoordinator } from './control/completionHandler';
import { FrameNavigator } from './control/frameNavigator';
import { PlaybackController } from './control/playbackController';

const warn = createDebugger('AnimationControl', 'warn');

type WorldWithAnimationCoordinator = World & {
  __motionAnimationCoordinator?: AnimationCoordinator;
};

function getAnimationCoordinator(world: World): AnimationCoordinator {
  const w = world as WorldWithAnimationCoordinator;
  if (!w.__motionAnimationCoordinator) {
    w.__motionAnimationCoordinator = new AnimationCoordinator();
  }
  return w.__motionAnimationCoordinator;
}

export class AnimationControl {
  private coordinator: BatchCoordinator;
  private playback: PlaybackController;
  private frames: FrameNavigator;

  constructor(
    entityId: number | number[],
    controls?: AnimationControl[],
    isBatch = false,
    world?: World,
  ) {
    this.coordinator = new BatchCoordinator({ entityId, controls, isBatch, world });
    this.playback = new PlaybackController(this.coordinator);
    this.frames = new FrameNavigator(this.coordinator);
  }

  stop() {
    this.playback.stop();
  }

  pause() {
    this.playback.pause();
  }

  play() {
    this.playback.play();
  }

  /** Reverse playback direction using negative playbackRate. */
  reverse() {
    this.playback.reverse();
  }

  /** Check if current playback is reversed (negative playbackRate) */
  isReversed(): boolean {
    return this.playback.isReversed(this.coordinator.getPrimaryEntityId());
  }

  /** Seek to an absolute time (ms) on the timeline. */
  seek(timeMs: number) {
    this.frames.seek(timeMs);
  }

  seekFrame(framePosition: number, fps?: number) {
    this.frames.seekFrame(framePosition, fps);
  }

  /** Get current absolute time (ms) on the timeline. */
  getCurrentTime(): number {
    return this.frames.getCurrentTime(this.coordinator.getPrimaryEntityId());
  }

  getFramePosition(fps?: number): number {
    return this.frames.getFramePosition(this.coordinator.getPrimaryEntityId(), fps);
  }

  getFrameIndex(fps?: number): number {
    return this.frames.getFrameIndex(this.coordinator.getPrimaryEntityId(), fps);
  }

  /** Get total duration (ms) of the timeline. */
  getDuration(): number {
    return this.frames.getDuration(this.coordinator.getPrimaryEntityId());
  }

  /** Set playback rate (1 = normal speed). */
  setPlaybackRate(rate: number) {
    this.playback.setPlaybackRate(rate);
  }

  /** Get playback rate (1 = normal speed). */
  getPlaybackRate(): number {
    return this.playback.getPlaybackRate(this.coordinator.getPrimaryEntityId());
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
    return this.coordinator.getEntityIds();
  }

  /** Get individual controls if this is a batch animation */
  getControls(): AnimationControl[] {
    return this.coordinator.getControls();
  }

  /** Get count of entities in this animation */
  getCount(): number {
    return this.coordinator.getCount();
  }

  /** Check if this is a batch animation */
  isBatchAnimation(): boolean {
    return this.coordinator.isBatchAnimation();
  }

  /**
   * Clean up animation and optionally remove entities
   * @param removeEntities - Whether to remove entities from world (default: true)
   */
  destroy(removeEntities = true): void {
    this.stop();

    if (removeEntities) {
      const world = this.coordinator.getWorld();
      for (const entityId of this.coordinator.getEntityIdView()) {
        const archetype = world.getEntityArchetype(entityId);
        if (archetype) {
          world.markForDeletion([entityId]);
        }
      }
      world.flushDeletions();
    }

    this.coordinator.clearReferences();
  }

  static registerOnComplete(control: AnimationControl, onComplete?: () => void): void {
    const world = control.coordinator.getWorld();
    getAnimationCoordinator(world).register(control, onComplete);
  }

  static clearCompletionForControl(control: AnimationControl): void {
    const world = control.coordinator.getWorld();
    getAnimationCoordinator(world).clear(control);
  }

  static handleMotionStatusChange(
    world: World,
    entityId: number,
    prevStatus: MotionStatus | undefined,
    nextStatus: MotionStatus,
  ): void {
    const completed = getAnimationCoordinator(world).handleStatusChange(
      entityId,
      prevStatus,
      nextStatus,
    );
    if (!completed) return;
    detachControlFromScopes(completed.control);
    try {
      completed.onComplete();
    } catch (e) {
      warn('onComplete callback failed:', e);
    }
  }
}

export type DomAnimationScope = {
  root: Element;
  animations: AnimationControl[];
};

function detachControlFromScopes(control: AnimationControl): void {
  const controlWithScopes = control as AnimationControl & { __domScopes?: Set<DomAnimationScope> };
  const scopes: Set<DomAnimationScope> | undefined = controlWithScopes.__domScopes;
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
  const controlWithScopes = control as AnimationControl & {
    __domScopes?: Set<DomAnimationScope>;
    destroy: (removeEntities?: boolean) => void;
  };
  if (!controlWithScopes.__domScopes) {
    controlWithScopes.__domScopes = new Set<DomAnimationScope>();
    const originalDestroy = control.destroy.bind(control);
    controlWithScopes.destroy = (removeEntities?: boolean) => {
      detachControlFromScopes(control);
      AnimationControl.clearCompletionForControl(control);
      return originalDestroy(removeEntities);
    };
  }
  controlWithScopes.__domScopes.add(scope);
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
