import { MotionStatus } from '@g-motion/core';
import type { AnimationControl } from '../control';

export class AnimationCoordinator {
  private entityToControl = new Map<number, AnimationControl>();
  private controlOnComplete = new WeakMap<AnimationControl, () => void>();
  private controlFinishedEntities = new WeakMap<AnimationControl, Set<number>>();

  register(control: AnimationControl, onComplete?: () => void): void {
    if (!onComplete) return;
    this.controlOnComplete.set(control, onComplete);
    const ids = control.getEntityIds();
    for (const id of ids) {
      this.entityToControl.set(id, control);
    }
    this.controlFinishedEntities.set(control, new Set());
  }

  clear(control: AnimationControl): void {
    this.controlOnComplete.delete(control);
    this.controlFinishedEntities.delete(control);
    const ids = control.getEntityIds();
    for (const id of ids) {
      this.entityToControl.delete(id);
    }
  }

  handleStatusChange(
    entityId: number,
    prevStatus: MotionStatus | undefined,
    nextStatus: MotionStatus,
  ): { control: AnimationControl; onComplete: () => void } | null {
    if (nextStatus !== MotionStatus.Finished || prevStatus === MotionStatus.Finished) {
      return null;
    }
    const control = this.entityToControl.get(entityId);
    if (!control) return null;
    const onComplete = this.controlOnComplete.get(control);
    if (!onComplete) return null;

    let finished = this.controlFinishedEntities.get(control);
    if (!finished) {
      finished = new Set<number>();
      this.controlFinishedEntities.set(control, finished);
    }

    finished.add(entityId);
    if (finished.size < control.getCount()) return null;

    this.clear(control);
    return { control, onComplete };
  }
}
