import { MotionStatus } from '@g-motion/core';
import { createDebugger } from '@g-motion/shared';
import type { World } from '@g-motion/core';
import { BatchCoordinator } from './control/batch-coordinator';
import { AnimationCoordinator } from './control/completion-handler';
import { FrameNavigator } from './control/frame-navigator';
import { PlaybackController } from './control/playback-controller';

const warn = createDebugger('AnimationControl', 'warn');

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('Animation was canceled', 'AbortError');
  }
  const err = new Error('Animation was canceled');
  err.name = 'AbortError';
  return err;
}

type ControlLifecycleState = {
  entityToControls: Map<number, Set<AnimationControl>>;
  controlFinishedEntities: WeakMap<AnimationControl, Set<number>>;
};

type WorldWithAnimationCoordinator = World & {
  __motionAnimationCoordinator?: AnimationCoordinator;
  __motionControlLifecycleState?: ControlLifecycleState;
};

function getAnimationCoordinator(world: World): AnimationCoordinator {
  const w = world as WorldWithAnimationCoordinator;
  if (!w.__motionAnimationCoordinator) {
    w.__motionAnimationCoordinator = new AnimationCoordinator();
  }
  return w.__motionAnimationCoordinator;
}

function getControlLifecycleState(world: World): ControlLifecycleState {
  const w = world as WorldWithAnimationCoordinator;
  if (!w.__motionControlLifecycleState) {
    w.__motionControlLifecycleState = {
      entityToControls: new Map<number, Set<AnimationControl>>(),
      controlFinishedEntities: new WeakMap<AnimationControl, Set<number>>(),
    };
  }
  return w.__motionControlLifecycleState;
}

function registerControlLifecycle(control: AnimationControl): void {
  const state = getControlLifecycleState(control.getWorldInternal());
  state.controlFinishedEntities.set(control, new Set<number>());
  const ids = control.getEntityIds();
  for (const id of ids) {
    let controls = state.entityToControls.get(id);
    if (!controls) {
      controls = new Set<AnimationControl>();
      state.entityToControls.set(id, controls);
    }
    controls.add(control);
  }
}

function unregisterControlLifecycle(control: AnimationControl): void {
  const state = getControlLifecycleState(control.getWorldInternal());
  state.controlFinishedEntities.delete(control);
  const ids = control.getEntityIds();
  for (const id of ids) {
    const controls = state.entityToControls.get(id);
    if (!controls) continue;
    controls.delete(control);
    if (controls.size === 0) {
      state.entityToControls.delete(id);
    }
  }
}

export class AnimationControl implements PromiseLike<void> {
  private coordinator: BatchCoordinator;
  private playback: PlaybackController;
  private frames: FrameNavigator;
  private _isFinishedSettled = false;
  private _resolveFinished!: () => void;
  private _rejectFinished!: (reason?: unknown) => void;
  readonly finished: Promise<void>;

  constructor(
    entityId: number | number[],
    controls?: AnimationControl[],
    isBatch = false,
    world?: World,
  ) {
    this.coordinator = new BatchCoordinator({ entityId, controls, isBatch, world });
    this.playback = new PlaybackController(this.coordinator);
    this.frames = new FrameNavigator(this.coordinator);

    this.finished = new Promise<void>((resolve, reject) => {
      this._resolveFinished = resolve;
      this._rejectFinished = reject;
    });

    registerControlLifecycle(this);

    if (isBatch && controls && controls.length > 0) {
      void Promise.all(controls.map((control) => control.finished)).then(
        () => this.resolveFinished(),
        (err) => this.rejectFinished(err),
      );
    }
  }

  stop() {
    this.playback.stop();
    this.resolveFinished();
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

  /**
   * Cancel animation and reject `finished` with AbortError.
   * This gives callers a way to distinguish canceled flows from normally completed flows.
   */
  cancel() {
    this.playback.stop();
    this.rejectFinished(createAbortError());
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


  getWorldInternal(): World {
    return this.coordinator.getWorld();
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

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.finished.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<void | TResult> {
    return this.finished.catch(onrejected);
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

    unregisterControlLifecycle(this);
    this.coordinator.clearReferences();

    // destroy 表示主动清理资源，不应打断 Promise 链路，因此视为正常完成。
    this.resolveFinished();
  }

  private resolveFinished(): void {
    if (this._isFinishedSettled) return;
    this._isFinishedSettled = true;
    unregisterControlLifecycle(this);
    this._resolveFinished();
  }

  private rejectFinished(reason: unknown): void {
    if (this._isFinishedSettled) return;
    this._isFinishedSettled = true;
    unregisterControlLifecycle(this);
    this._rejectFinished(reason);
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
    if (nextStatus === MotionStatus.Finished && prevStatus !== MotionStatus.Finished) {
      const lifecycle = getControlLifecycleState(world);
      const controls = lifecycle.entityToControls.get(entityId);
      if (controls) {
        for (const control of controls) {
          let finishedSet = lifecycle.controlFinishedEntities.get(control);
          if (!finishedSet) {
            finishedSet = new Set<number>();
            lifecycle.controlFinishedEntities.set(control, finishedSet);
          }
          finishedSet.add(entityId);
          if (finishedSet.size >= control.getCount()) {
            control.resolveFinished();
          }
        }
      }
    }

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
