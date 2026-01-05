import { describe, it, expect } from 'vitest';
import { NonNegativeRollingAverage } from '../../src';

describe('NonNegativeRollingAverage (utils)', () => {
  it('ignores NaN, Infinity and negative values', () => {
    const avg = new NonNegativeRollingAverage(3);
    avg.addSample(NaN);
    avg.addSample(Infinity);
    avg.addSample(-1);
    expect(avg.get()).toBe(0);
  });

  it('computes rolling average over fixed window', () => {
    const avg = new NonNegativeRollingAverage(3);
    avg.addSample(1);
    avg.addSample(2);
    avg.addSample(3);
    expect(avg.get()).toBe(2);

    avg.addSample(4);
    expect(avg.get()).toBe((2 + 3 + 4) / 3);
  });

  it('resets internal state', () => {
    const avg = new NonNegativeRollingAverage(2);
    avg.addSample(10);
    expect(avg.get()).toBe(10);
    avg.reset();
    expect(avg.get()).toBe(0);
  });
});
