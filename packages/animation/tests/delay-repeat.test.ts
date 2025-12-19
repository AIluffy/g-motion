import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '../src/index';
import { WorldProvider } from '@g-motion/core';

describe('Delay and Repeat Handling', () => {
  beforeAll(() => {
    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('respects delay before starting updates', async () => {
    const onUpdate = vi.fn();

    motion(0)
      .mark([{ to: 10, at: 50 }])
      .animate({ onUpdate, delay: 40 });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onUpdate).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onUpdate).toHaveBeenCalled();

    const firstValue = onUpdate.mock.calls[0][0];
    expect(firstValue).toBeGreaterThan(0);
  });

  it('finishes after configured repeats', async () => {
    const onUpdate = vi.fn();

    motion(0)
      .mark([{ to: 20, at: 30 }])
      .animate({ onUpdate, repeat: 1 });

    await new Promise((resolve) => setTimeout(resolve, 90));

    const lastValue = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
    expect(lastValue).toBeCloseTo(20, 0);

    const world = WorldProvider.useWorld();
    const activeCount = world.scheduler.getActiveEntityCount();
    expect(activeCount).toBe(0);
  });
});
