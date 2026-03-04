import { describe, expect, it } from 'vitest';
import { resolveStagger } from '../src/api/stagger';

describe('resolveStagger', () => {
  it('keeps legacy number behavior', () => {
    expect(resolveStagger(100, 0, 5)).toBe(0);
    expect(resolveStagger(100, 1, 5)).toBe(100);
    expect(resolveStagger(100, 4, 5)).toBe(400);
  });

  it("supports center origin", () => {
    const total = 5;
    const values = Array.from({ length: total }, (_, i) =>
      resolveStagger({ each: 50, from: 'center' }, i, total),
    );
    expect(values[2]).toBe(0);
    expect(values[0]).toBe(values[4]);
    expect(values[0]).toBeGreaterThan(values[1]);
  });

  it("supports last origin", () => {
    const total = 4;
    const values = Array.from({ length: total }, (_, i) =>
      resolveStagger({ each: 30, from: 'last' }, i, total),
    );
    expect(values[3]).toBe(0);
    expect(values[0]).toBeGreaterThan(values[1]);
    expect(values[1]).toBeGreaterThan(values[2]);
  });

  it('supports grid center spread', () => {
    const total = 12;
    const values = Array.from({ length: total }, (_, i) =>
      resolveStagger({ each: 40, grid: [3, 4], from: 'center' }, i, total),
    );

    const centerA = values[5];
    const centerB = values[6];
    expect(centerA).toBeLessThan(values[0]);
    expect(centerB).toBeLessThan(values[11]);
  });

  it('supports eased stagger distribution', () => {
    const total = 5;
    const linear = Array.from({ length: total }, (_, i) =>
      resolveStagger({ each: 50, from: 'first' }, i, total),
    );
    const eased = Array.from({ length: total }, (_, i) =>
      resolveStagger({ each: 50, from: 'first', ease: 'easeOutQuad' }, i, total),
    );

    expect(eased[1]).toBeGreaterThan(linear[1]);
    expect(eased[total - 1]).toBe(linear[total - 1]);
  });
});
