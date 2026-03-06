import { afterEach, describe, expect, it, vi } from 'vitest';

import { timeline } from '../src';
import { resetAnimationRuntimeForTests } from '../src/runtime/bootstrap';

afterEach(() => {
  vi.useRealTimers();
  resetAnimationRuntimeForTests();
});

describe('timeline()', () => {
  it('supports single-layer markers, workArea playback, and time values', () => {
    const target = { x: 0 };
    const ctrl = timeline({
      target,
      duration: 1000,
      x: [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ],
      markers: { midpoint: 500 },
      workArea: [200, 800],
      autoplay: false,
    });

    expect(ctrl.duration).toBe(1000);
    expect(ctrl.workArea).toEqual([200, 800]);

    ctrl.play();
    expect(ctrl.currentTime).toBe(200);
    expect(target.x).toBeCloseTo(20, 5);

    ctrl.seekToMarker('midpoint');
    expect(ctrl.currentTime).toBe(500);
    expect(ctrl.progress).toBeCloseTo(0.5, 5);
    expect(ctrl.timeValue().get()).toBe(500);
    expect(ctrl.progressValue().get()).toBeCloseTo(0.5, 5);
    expect(target.x).toBeCloseTo(50, 5);
  });

  it('aggregates multi-layer duration and offsets layer playback', () => {
    const moveTarget = { x: 0 };
    const fadeTarget = { opacity: 0 };

    const ctrl = timeline({
      autoplay: false,
      layers: [
        {
          name: 'move',
          target: moveTarget,
          startTime: 0,
          x: [
            { time: 0, value: 0 },
            { time: 400, value: 40 },
          ],
        },
        {
          name: 'fade',
          target: fadeTarget,
          startTime: 200,
          opacity: [
            { time: 0, value: 0 },
            { time: 300, value: 1 },
          ],
        },
      ],
      markers: { cue: 250 },
    });

    expect(ctrl.duration).toBe(500);

    ctrl.seekToMarker('cue');

    expect(moveTarget.x).toBeCloseTo(25, 5);
    expect(fadeTarget.opacity).toBeCloseTo(1 / 6, 5);
    expect(ctrl.currentTime).toBe(250);
  });

  it('throws when seeking to an unknown marker', () => {
    const ctrl = timeline({
      autoplay: false,
      target: { x: 0 },
      x: [{ time: 0, value: 0 }],
    });

    expect(() => ctrl.seekToMarker('missing')).toThrowError('Unknown marker: missing');
  });
});
