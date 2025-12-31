import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '../src/index';
import { WorldProvider } from '@g-motion/core';

describe('AnimationControl.reverse()', () => {
  beforeAll(() => {
    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('sets negative playbackRate and isReversed() becomes true', () => {
    const ctrl = motion(0)
      .mark([{ to: 100, at: 500 }])
      .play();

    // Initially not reversed
    expect(ctrl.isReversed()).toBe(false);

    // Reverse
    ctrl.reverse();

    expect(ctrl.isReversed()).toBe(true);
  });

  it('allows negative playbackRate via setPlaybackRate', () => {
    const ctrl = motion(0)
      .mark([{ to: 100, at: 500 }])
      .play();

    ctrl.setPlaybackRate(-2);

    expect(ctrl.getPlaybackRate()).toBe(-2);
    expect(ctrl.isReversed()).toBe(true);
  });

  it('finishes at start when reversed during playback', async () => {
    const onUpdate = vi.fn();

    const ctrl = motion(0)
      .mark([{ to: 100, at: 80 }])
      .option({ onUpdate })
      .play();

    await new Promise((resolve) => setTimeout(resolve, 50));
    ctrl.reverse();

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onUpdate).toHaveBeenCalled();

    const lastValue = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
    expect(Number.isFinite(lastValue)).toBe(true);
    expect(lastValue).toBeGreaterThanOrEqual(0);
    expect(lastValue).toBeLessThanOrEqual(10);

    const world = WorldProvider.useWorld();
    expect(ctrl.getCurrentTime()).toBe(0);
    expect(world.scheduler.getActiveEntityCount()).toBe(0);
  });
});
