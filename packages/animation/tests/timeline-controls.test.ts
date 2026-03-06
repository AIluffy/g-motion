import { afterEach, describe, expect, it, vi } from 'vitest';

import { keyframe, timeline, value } from '../src';
import { resetAnimationRuntimeForTests } from '../src/runtime/bootstrap';

afterEach(() => {
  vi.useRealTimers();
  resetAnimationRuntimeForTests();
});

describe('timeline control surface', () => {
  it('supports layer visibility, locking, moving, and track editing', () => {
    const target = { x: 0 };
    const ctrl = timeline({
      autoplay: false,
      layers: [
        {
          name: 'card',
          target,
          startTime: 100,
          x: [
            { time: 0, value: 0 },
            { time: 400, value: 40 },
          ],
        },
      ],
    });

    const layer = ctrl.layer('card');
    const track = layer.track('x');

    expect(layer.visible).toBe(true);
    expect(layer.locked).toBe(false);
    expect(layer.startTime).toBe(100);
    expect(layer.duration).toBe(400);

    ctrl.seek(200);
    expect(target.x).toBeCloseTo(10, 5);

    layer.hide();
    ctrl.seek(300);
    expect(target.x).toBeCloseTo(10, 5);
    expect(ctrl.bindState().getSnapshot().layers).toEqual([
      {
        name: 'card',
        visible: false,
        locked: false,
        startTime: 100,
        duration: 400,
      },
    ]);

    layer.show();
    expect(target.x).toBeCloseTo(20, 5);

    layer.lock();
    expect(() => layer.move(50)).toThrowError('Layer is locked: card');
    expect(() => track.insertKeyframe(keyframe(600, 80))).toThrowError('Layer is locked: card');

    layer.unlock();
    layer.move(50);
    expect(layer.startTime).toBe(150);

    ctrl.seek(200);
    expect(target.x).toBeCloseTo(5, 5);

    track.setCurve([keyframe(0, 0), { t: 200, v: 20 }, { time: 400, value: 40 }]);
    ctrl.seek(350);
    expect(target.x).toBeCloseTo(20, 5);

    track.insertKeyframe(keyframe(600, 80));
    expect(ctrl.duration).toBe(750);
    ctrl.seek(750);
    expect(target.x).toBeCloseTo(80, 5);

    track.removeKeyframe(200);
    expect(track.getCurve()).toEqual([
      { time: 0, value: 0 },
      { time: 400, value: 40 },
      { time: 600, value: 80 },
    ]);
  });

  it('publishes state snapshots for playback and authoring updates', () => {
    const y = value(3);
    const moveTarget = { x: 0, y: 0 };
    const fadeTarget = { opacity: 0 };
    const ctrl = timeline({
      autoplay: false,
      markers: { cue: 250 },
      workArea: [100, 450],
      layers: [
        {
          name: 'move',
          target: moveTarget,
          x: [
            { time: 0, value: 0 },
            { time: 400, value: 40 },
          ],
          y,
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
    });

    const store = ctrl.bindState();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.getSnapshot()).toEqual({
      duration: 500,
      currentTime: 0,
      progress: 0,
      isPlaying: false,
      markers: { cue: 250 },
      workArea: [100, 450],
      selectedLayer: null,
      layers: [
        {
          name: 'move',
          visible: true,
          locked: false,
          startTime: 0,
          duration: 400,
        },
        {
          name: 'fade',
          visible: true,
          locked: false,
          startTime: 200,
          duration: 300,
        },
      ],
      tracks: [
        {
          layer: 'move',
          property: 'x',
          keyframes: [
            { time: 0, value: 0 },
            { time: 400, value: 40 },
          ],
          currentValue: 0,
          isMotionValue: false,
        },
        {
          layer: 'move',
          property: 'y',
          keyframes: [],
          currentValue: 3,
          isMotionValue: true,
        },
        {
          layer: 'fade',
          property: 'opacity',
          keyframes: [
            { time: 0, value: 0 },
            { time: 300, value: 1 },
          ],
          currentValue: 0,
          isMotionValue: false,
        },
      ],
    });

    ctrl.seek(250);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        currentTime: 250,
        progress: 0.5,
        isPlaying: false,
      }),
    );

    ctrl.layer('fade').track('opacity').insertKeyframe(keyframe(600, 1));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        duration: 800,
      }),
    );

    y.set(9);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot().tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layer: 'move',
          property: 'y',
          currentValue: 9,
          isMotionValue: true,
        }),
      ]),
    );

    unsubscribe();
    ctrl.seek(300);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
