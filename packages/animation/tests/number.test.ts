import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '../src/index';

describe('Number Animation', () => {
  beforeAll(() => {
    // Mock rAF for Node environment
    global.requestAnimationFrame = (cb) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('animates a number from 0 to 100', async () => {
    const onUpdate = vi.fn();

    // motion(0) -> creates a number target
    // .mark(...) -> adds keyframe
    // .animate(...) -> starts and returns control
    const control = motion(0)
      .mark([{ to: 100, time: 50 }])
      .animate({ onUpdate });

    // Sanity check immediate start
    expect(control).toBeDefined();

    // We need to wait for the animation to complete.
    // Since we don't have a real loop in test environment unless we mock RAF or use real timers,
    // we assume the engine runs on real timers for integration tests.

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onUpdate).toHaveBeenCalled();

    // Check if it reached end value
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(lastCall).toBeCloseTo(100, 0);
  });
});
