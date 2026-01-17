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
});
