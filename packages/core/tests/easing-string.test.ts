import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEasingId,
  registerGpuEasing,
  __resetCustomEasings,
} from '../src/systems/easing-registry';

describe('GPU-Only Easing Registry', () => {
  beforeEach(() => {
    __resetCustomEasings();
  });

  describe('getEasingId', () => {
    it('should return correct ID for built-in easings', () => {
      expect(getEasingId('linear')).toBe(0);
      expect(getEasingId('easeInQuad')).toBe(1);
      expect(getEasingId('easeOutQuad')).toBe(2);
      expect(getEasingId('easeInOutQuad')).toBe(3);
      expect(getEasingId('easeInOutBounce')).toBe(30);
    });

    it('should resolve name aliases correctly', () => {
      expect(getEasingId('linear')).toBe(0);
      expect(getEasingId('easeIn')).toBe(1);
      expect(getEasingId('easeOut')).toBe(2);
      expect(getEasingId('easeInOut')).toBe(3);
    });

    it('should fallback to linear for unknown names', () => {
      expect(getEasingId('invalidEasing')).toBe(0);
      expect(getEasingId('notReal')).toBe(0);
    });

    it('should return linear for undefined', () => {
      expect(getEasingId(undefined)).toBe(0);
    });

    it('should return correct ID for registered custom easings', () => {
      registerGpuEasing('fn myCustom(t: f32) -> f32 { return t * t; }');
      const customId = getEasingId('myCustom');
      expect(customId).toBeGreaterThanOrEqual(31);
    });
  });

  describe('registerGpuEasing', () => {
    it('should extract name from WGSL and return it', () => {
      const name = registerGpuEasing('fn myEase(t: f32) -> f32 { return t * t; }');
      expect(name).toBe('myEase');
    });

    it('should make registered easing available via getEasingId', () => {
      registerGpuEasing('fn customEase(t: f32) -> f32 { return t; }');
      expect(getEasingId('customEase')).toBeGreaterThan(30);
    });

    it('should throw for invalid WGSL', () => {
      expect(() => registerGpuEasing('invalid wgsl')).toThrow();
    });
  });
});
