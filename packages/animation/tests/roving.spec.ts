import { describe, expect, it } from 'vitest';
import { distributeDurations, smooth } from '../src/systems/rovingResolver';

describe('Roving Resolver', () => {
  it('distributes durations proportionally and preserves total', () => {
    const lengths = [1, 3, 6];
    const durations = distributeDurations(lengths, 1000);
    const total = durations.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1000);
    expect(durations[0]).toBeLessThan(durations[2]);
  });

  it('smooths length spikes with Gaussian kernel', () => {
    const smoothed = smooth([0, 10, 0], {
      radius: 1,
      weights: [0.25, 0.5, 0.25],
    });
    expect(smoothed[1]).toBeLessThan(10);
    expect(smoothed[0]).toBeGreaterThan(0);
  });
});
