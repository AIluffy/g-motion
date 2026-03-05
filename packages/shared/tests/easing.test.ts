import { describe, it, expect } from 'vitest';
import { EasingRegistry, getEasingId } from '../src';

describe('EasingRegistry (shared CPU-facing surface)', () => {
  it('resolves built-in easing ids', () => {
    expect(getEasingId('linear')).toBe(0);
    expect(getEasingId('easeInQuad')).toBe(1);
    expect(getEasingId('easeOutQuad')).toBe(2);
  });

  it('supports alias mapping and fallback', () => {
    const reg = new EasingRegistry();
    expect(reg.getId('easeIn')).toBe(reg.getId('easeInQuad'));
    expect(reg.getId('unknown-easing')).toBe(0);
  });
});
