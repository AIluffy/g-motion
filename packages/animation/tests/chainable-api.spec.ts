import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '../src/index';

describe('Chainable API', () => {
  beforeAll(() => {
    // Mock rAF for Node environment
    // @ts-expect-error global polyfill for tests
    global.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    // @ts-expect-error global polyfill for tests
    global.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number);
  });

  it('supports batch mark([]) with duration segments', async () => {
    const onUpdate = vi.fn();

    const control = motion(0)
      .mark([
        { to: 100, duration: 50 },
        { to: 200, duration: 50 },
      ])
      .animate({ onUpdate });

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const last = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(last).toBeCloseTo(200, 0);
  });

  it('accepts ease alias for easing', async () => {
    const onUpdate = vi.fn();

    const control = motion(0)
      .mark([{ to: 100, at: 50, ease: 'easeOutQuad' }])
      .animate({ onUpdate });

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onUpdate).toHaveBeenCalled();
  });
});
