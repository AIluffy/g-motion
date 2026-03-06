import { afterEach, describe, expect, it, vi } from 'vitest';

import { motion } from '../src';
import { resetAnimationRuntimeForTests } from '../src/runtime/bootstrap';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  resetAnimationRuntimeForTests();
});

describe('motion()', () => {
  it('animates object targets, exposes mirror values, and supports seek/stop', () => {
    const target = { x: 10, opacity: 0 };
    const ctrl = motion(
      target,
      {
        x: 110,
        opacity: [0, 1],
      },
      {
        duration: 1000,
        autoplay: false,
      },
    );

    expect(ctrl.value('x')?.get()).toBe(10);
    expect(target.x).toBe(10);

    ctrl.seek(500);

    expect(target.x).toBeCloseTo(60, 5);
    expect(target.opacity).toBeCloseTo(0.5, 5);
    expect(ctrl.value('x')?.get()).toBeCloseTo(60, 5);

    ctrl.stop();

    expect(target.x).toBe(10);
    expect(target.opacity).toBe(0);
  });

  it('reads DOM starting values and completes playback callbacks', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="box" style="opacity: 0.2;"></div>';

    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    const element = document.querySelector('.box') as HTMLElement;

    const ctrl = motion(
      '.box',
      {
        opacity: 1,
      },
      {
        duration: 100,
        onUpdate,
        onComplete,
      },
    );

    await vi.advanceTimersByTimeAsync(120);

    expect(parseFloat(element.style.opacity)).toBeCloseTo(1, 5);
    expect(ctrl.value('opacity')?.get()).toBeCloseTo(1, 5);
    expect(onUpdate).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
