import { describe, expect, it, vi } from 'vitest';
import { AnimationControl } from '../src/api/control';

const MotionStatus = { Running: 1, Finished: 3 } as const;

type TestWorld = {
  setMotionStatus: (entityId: number, status: number) => void;
  getEntityArchetype: (entityId: number) => { id: number } | undefined;
  markForDeletion: (entityIds: number[]) => void;
  flushDeletions: () => void;
};

function createTestWorld(): TestWorld {
  return {
    setMotionStatus: vi.fn(),
    getEntityArchetype: vi.fn((entityId: number) => ({ id: entityId })),
    markForDeletion: vi.fn(),
    flushDeletions: vi.fn(),
  } as unknown as TestWorld;
}

describe('AnimationControl finished promise', () => {
  it('resolves finished for single animation and keeps onComplete compatibility', async () => {
    const world = createTestWorld();
    const control = new AnimationControl(1, undefined, false, world);
    const onComplete = vi.fn();

    AnimationControl.registerOnComplete(control, onComplete);
    AnimationControl.handleMotionStatusChange(world, 1, MotionStatus.Running, MotionStatus.Finished);

    await expect(control.finished).resolves.toBeUndefined();
    await expect(control).resolves.toBeUndefined();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('waits all child controls for batch animation finished', async () => {
    const world = createTestWorld();
    const childA = new AnimationControl(11, undefined, false, world);
    const childB = new AnimationControl(12, undefined, false, world);
    const batch = new AnimationControl([11, 12], [childA, childB], true, world);

    let resolved = false;
    void batch.finished.then(() => {
      resolved = true;
    });

    AnimationControl.handleMotionStatusChange(
      world,
      11,
      MotionStatus.Running,
      MotionStatus.Finished,
    );
    await Promise.resolve();
    expect(resolved).toBe(false);

    AnimationControl.handleMotionStatusChange(
      world,
      12,
      MotionStatus.Running,
      MotionStatus.Finished,
    );
    await expect(batch.finished).resolves.toBeUndefined();
  });

  it('resolves finished immediately after stop()', async () => {
    const world = createTestWorld();
    const control = new AnimationControl(2, undefined, false, world);

    control.stop();

    await expect(control.finished).resolves.toBeUndefined();
  });

  it('resolves finished after destroy()', async () => {
    const world = createTestWorld();
    const control = new AnimationControl(3, undefined, false, world);

    control.destroy();

    await expect(control.finished).resolves.toBeUndefined();
    expect(world.markForDeletion).toHaveBeenCalledWith([3]);
    expect(world.flushDeletions).toHaveBeenCalledTimes(1);
  });
});
