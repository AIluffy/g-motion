import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion, engine } from '../src';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('GPU time semantics vs CPU', () => {
  beforeAll(() => {
    const g = global as any;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    g.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number);
  });

  const modes: Array<'never' | 'always'> = ['never', 'always'];

  it('respects delay in both GPU on and off modes', async () => {
    for (const mode of modes) {
      engine.forceGpu(mode);

      const onUpdate = vi.fn();

      motion(0)
        .mark([{ to: 10, at: 50 }])
        .animate({ onUpdate, delay: 40 });

      await wait(30);
      expect(onUpdate).not.toHaveBeenCalled();

      await wait(40);
      expect(onUpdate).toHaveBeenCalled();
    }
  });

  it('honors repeat behavior consistently for GPU on and off', async () => {
    for (const mode of modes) {
      engine.forceGpu(mode);

      const onUpdate = vi.fn();

      motion(0)
        .mark([{ to: 20, at: 30 }])
        .animate({ onUpdate, repeat: 1 });

      await wait(90);

      const lastValue = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
      expect(lastValue).toBeCloseTo(20, 0);
    }
  });

  it('keeps seek semantics consistent for GPU modes', () => {
    for (const mode of modes) {
      engine.forceGpu(mode);

      const ctrl = motion(0)
        .mark([{ to: 100, duration: 500 }])
        .mark([{ to: 200, duration: 500 }])
        .animate();

      expect(ctrl.getDuration()).toBe(1000);

      ctrl.seek(400);
      expect(ctrl.getCurrentTime()).toBe(400);

      ctrl.seek(5000);
      expect(ctrl.getCurrentTime()).toBe(1000);

      ctrl.seek(-10);
      expect(ctrl.getCurrentTime()).toBe(0);
    }
  });
});
