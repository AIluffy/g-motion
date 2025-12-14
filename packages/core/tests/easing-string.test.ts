import { describe, it, expect } from 'vitest';
import {
  resolveEasing,
  getEasingId,
  EASING_IDS,
  EASING_FUNCTIONS,
} from '../src/systems/easing-registry';

describe('String-based easing support', () => {
  it('resolveEasing should convert string to function', () => {
    const easingFn = resolveEasing('easeInOut');
    expect(typeof easingFn).toBe('function');
    expect(easingFn(0.5)).toBeCloseTo(0.5);
  });

  it('resolveEasing should pass through function as-is', () => {
    const customFn = (t: number) => t * t;
    const resolved = resolveEasing(customFn);
    expect(resolved).toBe(customFn);
  });

  it('resolveEasing should fallback to linear for invalid string', () => {
    const easingFn = resolveEasing('invalidEasing');
    expect(easingFn).toBe(EASING_FUNCTIONS.easeLinear);
  });

  it('resolveEasing should fallback to linear for undefined', () => {
    const easingFn = resolveEasing(undefined);
    expect(easingFn).toBe(EASING_FUNCTIONS.easeLinear);
  });

  it('getEasingId should return correct ID for string', () => {
    expect(getEasingId('linear')).toBe(EASING_IDS.easeLinear);
    expect(getEasingId('easeInOut')).toBe(EASING_IDS.easeInOutQuad);
    expect(getEasingId('easeOutBounce')).toBe(EASING_IDS.easeOutBounce);
  });

  it('getEasingId should return correct ID for named function', () => {
    function easeInQuad(t: number) {
      return t * t;
    }
    expect(getEasingId(easeInQuad)).toBe(EASING_IDS.easeInQuad);
  });

  it('getEasingId should fallback to linear for invalid string', () => {
    expect(getEasingId('invalidEasing')).toBe(EASING_IDS.easeLinear);
  });

  it('all simplified easing names should resolve correctly', () => {
    const easingNames = [
      'linear',
      'easeIn',
      'easeOut',
      'easeInOut',
      'easeInSine',
      'easeOutSine',
      'easeInOutSine',
      'easeInExpo',
      'easeOutExpo',
      'easeInOutExpo',
      'easeInCirc',
      'easeOutCirc',
      'easeInOutCirc',
      'easeInBack',
      'easeOutBack',
      'easeInOutBack',
      'easeInElastic',
      'easeOutElastic',
      'easeInOutElastic',
      'easeInBounce',
      'easeOutBounce',
      'easeInOutBounce',
    ] as const;

    easingNames.forEach((name) => {
      const fn = resolveEasing(name);
      expect(typeof fn).toBe('function');
      expect(fn(0)).toBeCloseTo(0, 10); // All easings should start at 0
      expect(fn(1)).toBeCloseTo(1, 10); // All easings should end at 1
    });
  });
});
