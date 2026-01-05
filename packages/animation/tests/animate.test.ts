import { describe, it, expect, vi, beforeAll } from 'vitest';
import { animate } from '../src';

describe('animate syntax sugar', () => {
  beforeAll(() => {
    global.requestAnimationFrame = (cb) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('animates a simple object with one-shot call', async () => {
    const target = { opacity: 0 };

    const control = animate(target, { opacity: 1 }, { duration: 50 });

    expect(control).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(target.opacity).toBeGreaterThan(0.9);
    expect(target.opacity).toBeLessThanOrEqual(1);
  });

  it('supports keyframe arrays for properties', async () => {
    const target = { x: 0 };

    const control = animate(target, { x: [0, 100, 50] }, { duration: 100 });

    expect(control).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(target.x).toBeGreaterThan(40);
    expect(target.x).toBeLessThan(60);
  });

  it('respects delay and repeat options', async () => {
    const onUpdate = vi.fn();

    animate(0 as any, { value: 10 }, { duration: 30, delay: 40, repeat: 1, onUpdate });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onUpdate).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('supports primitive number from/to signature', async () => {
    const onUpdate = vi.fn();

    animate(0, 10, { duration: 50, onUpdate });

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(onUpdate).toHaveBeenCalled();
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(typeof lastCall).toBe('number');
    expect(lastCall).toBeGreaterThan(9);
    expect(lastCall).toBeLessThanOrEqual(10);
  });

  it('supports repeatType reverse (pingpong) with data integrity', async () => {
    const target = { x: 0 };

    const control = animate(target, { x: [0, 100] }, { duration: 80, repeatType: 'reverse' });

    expect(control).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(target.x).toBeGreaterThan(0);
    expect(target.x).toBeLessThanOrEqual(100);

    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.x).toBeLessThanOrEqual(100);
    expect(target.x).toBeGreaterThan(30);
    expect(target.x).toBeLessThan(80);

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.x).toBeLessThanOrEqual(10);
  });
});
