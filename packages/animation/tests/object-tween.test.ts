import { describe, it, expect, vi } from 'vitest';
import { motion } from '../src/index';

describe('Object Tween Tests', () => {
  it('should animate a number via onUpdate callback', async () => {
    const onUpdate = vi.fn();
    const control = motion(0)
      .mark([{ to: 100, at: 50 }])
      .option({ onUpdate })
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onUpdate).toHaveBeenCalled();
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(lastCall).toBeCloseTo(100, 0);
  });

  it('should animate a number primitive directly without wrapping', async () => {
    const onUpdate = vi.fn();
    // Direct number animation: motion(20).mark([{ to: 30 }])
    const control = motion(20)
      .mark([{ to: 50, at: 50 }])
      .option({ onUpdate })
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onUpdate).toHaveBeenCalled();
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(lastCall).toBeCloseTo(50, 0);
  });

  it('should animate an object with onUpdate callback', async () => {
    const onUpdate = vi.fn();
    const target = { value: 0 };

    const control = motion(target)
      .mark([{ to: { value: 100 }, at: 50 }])
      .option({ onUpdate })
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onUpdate).toHaveBeenCalled();
    // onUpdate should receive the updated value
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(lastCall).toBeCloseTo(100, 0);
  });

  it('should animate multiple properties in an object', async () => {
    const onUpdate = vi.fn();
    const target = { x: 0, y: 0 };

    const control = motion(target)
      .mark([{ to: { x: 100, y: 50 }, at: 50 }])
      .option({ onUpdate })
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onUpdate).toHaveBeenCalled();
    // onUpdate should receive the entire props object
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(lastCall).toEqual({ x: expect.closeTo(100, 0), y: expect.closeTo(50, 0) });
  });

  it('should animate object without onUpdate callback', async () => {
    const target = { value: 0 };

    const control = motion(target)
      .mark([{ to: { value: 100 }, at: 50 }])
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Target object should be updated directly
    expect(target.value).toBeCloseTo(100, 0);
  });

  it('should support chained marks on objects', async () => {
    const onUpdate = vi.fn();
    const target = { count: 0 };

    const control = motion(target)
      .mark([{ to: { count: 100 }, at: 50 }])
      .mark([{ to: { count: 200 }, at: 100 }])
      .option({ onUpdate })
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(onUpdate).toHaveBeenCalled();
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    // Since there's a single property 'count', onUpdate receives the numeric value
    expect(lastCall).toBeCloseTo(200, 0);
  });

  it('should support string animation (numbers passed as "to" values)', async () => {
    const onUpdate = vi.fn();

    const control = motion(0)
      .mark([{ to: 50, at: 50 }])
      .option({ onUpdate })
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onUpdate).toHaveBeenCalled();
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(lastCall).toBeCloseTo(50, 0);
  });

  it('should support chained marks on primitive numbers', async () => {
    const onUpdate = vi.fn();

    const control = motion(0)
      .mark([{ to: 100, at: 50 }])
      .mark([{ to: 50, at: 100 }])
      .option({ onUpdate })
      .play();

    expect(control).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(onUpdate).toHaveBeenCalled();
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(lastCall).toBeCloseTo(50, 0);
  });
});
