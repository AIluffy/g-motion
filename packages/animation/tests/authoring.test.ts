import { afterEach, describe, expect, it, vi } from 'vitest';

import { compose, keyframe, timeline, value } from '../src';
import { resetAnimationRuntimeForTests } from '../src/runtime/bootstrap';

afterEach(() => {
  vi.useRealTimers();
  resetAnimationRuntimeForTests();
});

describe('timeline authoring model', () => {
  it('normalizes helper, shorthand, from/to, and motion value track inputs', () => {
    const source = value(5);
    const target = { x: 0, opacity: 0, y: 0 };

    const ctrl = timeline({
      autoplay: false,
      layers: [
        {
          name: 'card',
          target,
          x: [
            keyframe(0, 0),
            { t: 500, v: 50, e: 'easeOut' },
            { time: 1000, value: 50, hold: true },
            { time: 1500, value: 100 },
          ],
          opacity: { from: 0, to: 1, duration: 300, easing: 'easeIn' },
          y: source,
        },
      ],
      markers: { cue: 400 },
      workArea: [100, 1200],
    });

    expect(keyframe(250, 20, 'easeInOut')).toEqual({
      time: 250,
      value: 20,
      easing: 'easeInOut',
    });

    expect(ctrl.layer('card').track('x').getCurve()).toEqual([
      { time: 0, value: 0 },
      { time: 500, value: 50, easing: 'easeOut' },
      { time: 1000, value: 50, hold: true },
      { time: 1500, value: 100 },
    ]);

    expect(ctrl.layer('card').track('opacity').getCurve()).toEqual([
      { time: 0, value: 0, easing: 'easeIn' },
      { time: 300, value: 1 },
    ]);

    const snapshot = ctrl.bindState().getSnapshot();

    expect(snapshot.markers).toEqual({ cue: 400 });
    expect(snapshot.workArea).toEqual([100, 1200]);
    expect(snapshot.selectedLayer).toBeNull();
    expect(snapshot.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layer: 'card',
          property: 'y',
          currentValue: 5,
          isMotionValue: true,
          keyframes: [],
        }),
      ]),
    );
  });

  it('rejects invalid keyframe objects', () => {
    expect(() =>
      timeline({
        autoplay: false,
        target: { x: 0 },
        x: [{ v: 10 } as never],
      }),
    ).toThrowError(/Invalid keyframe/);
  });

  it('expands reusable composition layers with target override and duration override', () => {
    const cardEnter = compose({
      target: { x: 999, opacity: 999 },
      x: [
        { time: 0, value: 100 },
        { time: 500, value: 0 },
      ],
      opacity: [
        { time: 0, value: 0 },
        { time: 300, value: 1 },
      ],
    });
    const card1 = { x: 0, opacity: 0 };
    const card2 = { x: 0, opacity: 0 };

    const ctrl = timeline({
      autoplay: false,
      layers: [
        { name: 'card1', target: card1, composition: cardEnter },
        {
          name: 'card2',
          target: card2,
          composition: cardEnter,
          startTime: 200,
          duration: 700,
        },
      ],
    });

    expect(ctrl.duration).toBe(900);

    ctrl.seek(250);

    expect(card1.x).toBeCloseTo(50, 5);
    expect(card1.opacity).toBeCloseTo(5 / 6, 5);
    expect(card2.x).toBeCloseTo(90, 5);
    expect(card2.opacity).toBeCloseTo(1 / 6, 5);
  });

  it('rejects composition layers without a resolved target or with extra animated props', () => {
    const enter = compose({
      x: [{ time: 0, value: 0 }],
    });

    expect(() =>
      timeline({
        autoplay: false,
        layers: [{ name: 'missing-target', composition: enter }],
      }),
    ).toThrowError('Composition layer "missing-target" requires a target');

    expect(() =>
      timeline({
        autoplay: false,
        layers: [
          {
            name: 'invalid',
            target: { x: 0 },
            composition: enter,
            x: [{ time: 0, value: 1 }],
          },
        ],
      }),
    ).toThrowError('Composition layer "invalid" cannot define animated props');
  });
});
