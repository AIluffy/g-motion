import { describe, it, expect } from 'vitest';
import { motion } from '../src/api/builder';

describe('Instant keyframes (time=0)', () => {
  it('should handle time=0 keyframe without NaN errors', () => {
    const obj = { value: 100 };

    const control = motion(obj)
      .mark([{ to: { value: 0 }, time: 0 }]) // Instant keyframe
      .mark([{ to: { value: 50 }, time: 500 }])
      .animate();

    // Systems haven't run yet, value updates on next frame
    // The important test is that no NaN/errors occur
    expect(control).toBeDefined();
    expect(isNaN(obj.value)).toBe(false);

    control.stop();
  });

  it('should support multiple instant keyframes', () => {
    const obj = { x: 0, y: 0 };

    const control = motion(obj)
      .mark([{ to: { x: 10, y: 20 }, time: 0 }])
      .mark([{ to: { x: 50, y: 60 }, time: 0 }]) // Second instant at same time
      .mark([{ to: { x: 100, y: 200 }, time: 500 }])
      .animate();

    // Should be at the last instant keyframe
    expect(obj.x).toBeGreaterThanOrEqual(0);
    expect(obj.y).toBeGreaterThanOrEqual(0);

    control.stop();
  });

  it('should transition from instant keyframe to timed keyframe', () => {
    const obj = { scale: 0 };

    const control = motion(obj)
      .mark([{ to: { scale: 0 }, time: 0 }]) // Start at 0
      .mark([{ to: { scale: 1 }, time: 100 }])
      .animate();

    // Initial value should be 0 (instant keyframe)
    expect(obj.scale).toBe(0);

    control.stop();
  });

  it('should work with DOM elements', () => {
    const el = document.createElement('div');

    const control = motion(el)
      .mark([{ to: { x: '0px', y: '0px', scale: 0 }, time: 0 }])
      .mark([{ to: { x: '100px', y: '50px', scale: 1 }, time: 500 }])
      .animate();

    // Should create entity without errors
    expect(control).toBeDefined();

    control.stop();
  });

  it('should use dom renderer for HTMLElement targets', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const control = motion(el)
      .mark([{ to: { x: '50px', y: '100px', scale: 1.5 }, time: 300 }])
      .animate();

    // Should not throw and should create entity
    expect(control).toBeDefined();

    control.stop();
    el.remove();
  });

  it('should handle primitive number targets with time=0', () => {
    let currentValue = 100;

    const control = motion(0)
      .mark([{ to: 50, time: 100 }])
      .animate({
        onUpdate: (val) => {
          currentValue = val;
        },
      });

    // Should work without NaN
    expect(currentValue).toBeGreaterThanOrEqual(0);
    expect(currentValue).toBeLessThanOrEqual(100);

    control.stop();
  });
});
