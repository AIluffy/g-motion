import { afterEach, describe, expect, it, vi } from 'vitest';

import { spring, transform, value, velocity } from '../src';

afterEach(() => {
  vi.useRealTimers();
});

describe('MotionValue facade primitives', () => {
  it('reads, writes, updates, and unsubscribes', () => {
    const x = value(10);
    const events: Array<[number, number]> = [];

    const unsubscribe = x.onChange((latest, delta) => {
      events.push([latest, delta]);
    });

    x.set(25);
    x.update((current) => current + 5);
    unsubscribe();
    x.set(100);

    expect(x.get()).toBe(100);
    expect(events).toEqual([
      [25, 15],
      [30, 5],
    ]);
  });

  it('supports function, range, and multi-source transforms', () => {
    const x = value(10);
    const y = value(5);

    const doubled = transform(x, (latest) => latest * 2);
    const ranged = transform(x, {
      input: [0, 100],
      output: [0, 1],
    });
    const combined = transform([x, y], (xv, yv) => xv - yv);

    x.set(40);
    y.set(8);

    expect(doubled.get()).toBe(80);
    expect(ranged.get()).toBeCloseTo(0.4, 5);
    expect(combined.get()).toBe(32);
  });

  it('animates a spring follower toward its source value', async () => {
    vi.useFakeTimers();

    const source = value(0);
    const follower = spring(source, {
      stiffness: 160,
      damping: 20,
      mass: 1,
    });

    source.set(100);
    await vi.advanceTimersByTimeAsync(32);
    const mid = follower.get();
    await vi.advanceTimersByTimeAsync(1000);

    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(follower.get()).toBeCloseTo(100, 0);
  });

  it('derives velocity from source updates over time', async () => {
    vi.useFakeTimers();

    const source = value(0);
    const speed = velocity(source);

    await vi.advanceTimersByTimeAsync(20);
    source.set(20);

    expect(speed.get()).toBeCloseTo(1000, 0);
  });
});
