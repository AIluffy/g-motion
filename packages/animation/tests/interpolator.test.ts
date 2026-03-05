import { describe, expect, it } from 'vitest';
import { motion, KeyframeInterpolator, TweenInterpolator } from '../src';

describe('Interpolator strategy', () => {
  it('TweenInterpolator should evaluate between from/to', () => {
    const interpolator = new TweenInterpolator(10, 20);
    expect(interpolator.evaluate(0)).toBe(10);
    expect(interpolator.evaluate(0.5)).toBe(15);
    expect(interpolator.evaluate(1)).toBe(20);
  });

  it('KeyframeInterpolator should evaluate piecewise keyframes', () => {
    const interpolator = new KeyframeInterpolator([0, 10, 20]);
    expect(interpolator.evaluate(0)).toBe(0);
    expect(interpolator.evaluate(0.25)).toBe(5);
    expect(interpolator.evaluate(0.5)).toBe(10);
    expect(interpolator.evaluate(0.75)).toBe(15);
    expect(interpolator.evaluate(1)).toBe(20);
  });

  it('MotionBuilder should allow custom interpolator injection', () => {
    const builder = motion(0);
    builder.setInterpolator({ evaluate: () => 42 });
    expect(builder.evaluate(0.3)).toBe(42);
  });
});
