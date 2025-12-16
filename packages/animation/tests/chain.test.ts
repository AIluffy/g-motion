import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '../src/index';

describe('Chained Animation', () => {
  beforeAll(() => {
    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('sequences animations', async () => {
    const onUpdate = vi.fn();

    // 0 -> 100 (0-50ms) -> 200 (50-100ms)
    motion(0)
      .mark([{ to: 100, at: 50 }])
      .mark([{ to: 200, at: 100 }])
      .animate({ onUpdate });

    // Wait for first part to finish (50ms) + partial second
    await new Promise((resolve) => setTimeout(resolve, 75));

    const callAfter75 = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    // At 75ms, we are 25ms into the second tween (100 -> 200).
    // 25/50 = 50%. Value should be 150.
    // Relax check due to timing variance in tests
    expect(callAfter75).toBeGreaterThan(120);
    expect(callAfter75).toBeLessThan(180);

    // Wait rest
    await new Promise((resolve) => setTimeout(resolve, 50));

    const finalCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(finalCall).toBeCloseTo(200, 0);
  });
});
