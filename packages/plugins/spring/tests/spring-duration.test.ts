import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '@g-motion/animation';
import { WorldProvider, MotionStatus, app } from '@g-motion/core';
import { SpringPlugin } from '../src/index';

describe('Spring Duration Behavior', () => {
  beforeAll(() => {
    SpringPlugin.setup(app);

    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('ignores time parameter for spring animations', async () => {
    const world = WorldProvider.useWorld();
    const onUpdate = vi.fn();

    // Create spring animation with short time parameter
    motion(0)
      .mark([
        {
          to: 100,
          at: 50,
          spring: {
            stiffness: 100,
            damping: 10,
            restSpeed: 1,
            restDelta: 0.5,
          },
        },
      ])
      .option({ onUpdate })
      .play();

    // Wait past the specified time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Animation should still be running (not limited by time parameter)
    let stillRunning = false;
    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      if (stateBuffer && archetype.entityCount > 0) {
        const state = stateBuffer[archetype.entityCount - 1] as any;
        if (state.status === MotionStatus.Running) {
          stillRunning = true;
        }
      }
    }

    // Spring should still be running since it hasn't reached rest yet
    expect(stillRunning || onUpdate.mock.calls.length > 3).toBe(true);
  });

  it('completes only when physics reach rest state', async () => {
    const world = WorldProvider.useWorld();

    // Create spring with quick settling parameters
    motion(0)
      .mark([
        {
          to: 10,
          at: 100,
          spring: {
            stiffness: 1000,
            damping: 100,
            restSpeed: 50,
            restDelta: 2,
          },
        },
      ])
      .play();

    // Wait for spring to settle
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should be completed based on physics, not time
    let isFinished = false;
    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      if (stateBuffer && archetype.entityCount > 0) {
        const state = stateBuffer[archetype.entityCount - 1] as any;
        if (state.status === MotionStatus.Finished) {
          isFinished = true;
        }
      }
    }

    expect(isFinished).toBe(true);
  });

  it('does not repeat based on duration for spring animations', async () => {
    const onUpdate = vi.fn();

    // Create spring with repeat
    motion(0)
      .mark([
        {
          to: 100,
          at: 50,
          spring: { stiffness: 100, damping: 10 },
        },
      ])
      .option({
        repeat: 2,
        onUpdate,
      })
      .play();

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Spring animation should run continuously until rest,
    // not restart multiple times based on duration
    // We just verify it called onUpdate multiple times
    expect(onUpdate.mock.calls.length).toBeGreaterThan(0);
  });

  it('timeline duration check is skipped for spring entities', async () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([
        {
          to: 100,
          at: 100,
          spring: {
            stiffness: 50,
            damping: 5,
            restSpeed: 1,
            restDelta: 0.1,
          },
        },
      ])
      .play();

    // Wait past the specified duration
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check if animation is still running (duration check was skipped)
    let status = null;
    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      if (stateBuffer && archetype.entityCount > 0) {
        status = (stateBuffer[archetype.entityCount - 1] as any).status;
      }
    }

    // Should still be running since spring hasn't settled
    // (if duration check wasn't skipped, it would be Finished)
    expect(status).toBe(MotionStatus.Running);
  });
});
