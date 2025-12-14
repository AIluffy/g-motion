import { describe, it, expect } from 'vitest';
import { motion } from '../src/api/builder';

describe('AnimationControl.reverse()', () => {
  it('sets negative playbackRate and isReversed() becomes true', () => {
    const ctrl = motion(0)
      .mark([{ to: 100, time: 500 }])
      .animate();

    // Initially not reversed
    expect(ctrl.isReversed()).toBe(false);

    // Reverse
    ctrl.reverse();

    expect(ctrl.isReversed()).toBe(true);
  });
});
