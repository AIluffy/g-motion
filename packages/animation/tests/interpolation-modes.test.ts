import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '../src/index';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Interpolation Modes', () => {
  beforeAll(() => {
    // Mock rAF for Node environment
    // @ts-ignore: test environment polyfill
    global.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    // @ts-ignore: test environment polyfill
    global.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number);
  });

  it('applies hold mode (step change)', async () => {
    const onUpdate = vi.fn();

    motion(0)
      .mark([{ to: 50, at: 40, interp: 'hold' }])
      .option({ onUpdate })
      .play();

    await wait(60);

    const last = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
    expect(last).toBeCloseTo(50, 0);
  });

  it('applies bezier mode with control points', async () => {
    const onUpdate = vi.fn();

    motion(0)
      .mark([
        {
          to: 100,
          at: 80,
          interp: 'bezier',
          bezier: { cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 },
        },
      ])
      .option({ onUpdate })
      .play();

    await wait(120);

    const last = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
    expect(last).toBeCloseTo(100, 0);
  });

  it('applies autoBezier default curve', async () => {
    const onUpdate = vi.fn();

    motion(0)
      .mark([{ to: 75, at: 60, interp: 'autoBezier' }])
      .option({ onUpdate })
      .play();

    await wait(100);

    const last = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
    expect(last).toBeCloseTo(75, 0);
  });
});
