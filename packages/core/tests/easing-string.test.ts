import { describe, it, expect, beforeEach } from 'vitest';
import { EasingRegistry } from '../../shared/src/easing/registry';

describe('GPU-Only Easing Registry', () => {
  let registry: EasingRegistry;

  beforeEach(() => {
    registry = new EasingRegistry();
  });

  describe('getEasingId', () => {
    it('should return correct ID for built-in easings', () => {
      expect(registry.getEasingId('linear')).toBe(0);
      expect(registry.getEasingId('easeInQuad')).toBe(1);
      expect(registry.getEasingId('easeOutQuad')).toBe(2);
      expect(registry.getEasingId('easeInOutQuad')).toBe(3);
      expect(registry.getEasingId('easeInOutBounce')).toBe(30);
    });

    it('should resolve name aliases correctly', () => {
      expect(registry.getEasingId('linear')).toBe(0);
      expect(registry.getEasingId('easeIn')).toBe(1);
      expect(registry.getEasingId('easeOut')).toBe(2);
      expect(registry.getEasingId('easeInOut')).toBe(3);
    });

    it('should fallback to linear for unknown names', () => {
      expect(registry.getEasingId('invalidEasing')).toBe(0);
      expect(registry.getEasingId('notReal')).toBe(0);
    });

    it('should return linear for undefined', () => {
      expect(registry.getEasingId(undefined)).toBe(0);
    });

    it('should return correct ID for registered custom easings', () => {
      registry.registerGpuEasing('fn myCustom(t: f32) -> f32 { return t * t; }');
      const customId = registry.getEasingId('myCustom');
      expect(customId).toBeGreaterThanOrEqual(31);
    });
  });

  describe('registerGpuEasing', () => {
    it('should extract name from WGSL and return it', () => {
      const name = registry.registerGpuEasing('fn myEase(t: f32) -> f32 { return t * t; }');
      expect(name).toBe('myEase');
    });

    it('should make registered easing available via getEasingId', () => {
      registry.registerGpuEasing('fn customEase(t: f32) -> f32 { return t; }');
      expect(registry.getEasingId('customEase')).toBeGreaterThan(30);
    });

    it('should throw for invalid WGSL', () => {
      expect(() => registry.registerGpuEasing('invalid wgsl')).toThrow();
    });
  });
});
