import { describe, it, expect } from 'vitest';
import {
  HalfFloatBuffer,
  createHalfFloatBufferFrom,
  shouldUseHalfFloat,
  DEFAULT_HALF_FLOAT_COMPONENTS,
} from '../src/data/half-float';

describe('HalfFloatBuffer', () => {
  describe('Basic Operations', () => {
    it('should create buffer with correct size', () => {
      const buffer = new HalfFloatBuffer(100);
      expect(buffer.length).toBe(100);
      expect(buffer.byteLength).toBe(200); // 100 * 2 bytes
    });

    it('should set and get values', () => {
      const buffer = new HalfFloatBuffer(10);
      buffer.set(0, 123.456);
      const value = buffer.get(0);

      // Half-float has limited precision (~3 decimal digits)
      expect(value).toBeCloseTo(123.456, 1);
    });

    it('should handle typical animation values accurately', () => {
      const buffer = new HalfFloatBuffer(5);
      const testValues = [
        { value: 0, expected: 0 },
        { value: 100, expected: 100 },
        { value: 1.5, expected: 1.5 },
        { value: -50.25, expected: -50.25 },
        { value: 360, expected: 360 },
      ];

      testValues.forEach(({ value, expected }, index) => {
        buffer.set(index, value);
        expect(buffer.get(index)).toBeCloseTo(expected, 1);
      });
    });

    it('should throw on out of bounds access', () => {
      const buffer = new HalfFloatBuffer(10);
      expect(() => buffer.set(-1, 0)).toThrow(RangeError);
      expect(() => buffer.set(10, 0)).toThrow(RangeError);
      expect(() => buffer.get(-1)).toThrow(RangeError);
      expect(() => buffer.get(10)).toThrow(RangeError);
    });
  });

  describe('Special Values', () => {
    it('should handle zero', () => {
      const buffer = new HalfFloatBuffer(3);
      buffer.set(0, 0);
      buffer.set(1, -0);

      expect(buffer.get(0)).toBe(0);
      expect(buffer.get(1)).toBe(-0);
    });

    it('should handle infinity', () => {
      const buffer = new HalfFloatBuffer(2);
      buffer.set(0, Infinity);
      buffer.set(1, -Infinity);

      expect(buffer.get(0)).toBe(Infinity);
      expect(buffer.get(1)).toBe(-Infinity);
    });

    it('should handle NaN', () => {
      const buffer = new HalfFloatBuffer(1);
      buffer.set(0, NaN);

      expect(buffer.get(0)).toBeNaN();
    });

    it('should handle very small numbers', () => {
      const buffer = new HalfFloatBuffer(2);
      buffer.set(0, 0.0001);
      buffer.set(1, -0.0001);

      // Very small numbers may lose precision or become zero
      const val1 = buffer.get(0);
      const val2 = buffer.get(1);

      expect(Math.abs(val1)).toBeLessThan(0.001);
      expect(Math.abs(val2)).toBeLessThan(0.001);
    });

    it('should handle large numbers within range', () => {
      const buffer = new HalfFloatBuffer(2);
      buffer.set(0, 60000);
      buffer.set(1, -60000);

      expect(buffer.get(0)).toBeCloseTo(60000, -2);
      expect(buffer.get(1)).toBeCloseTo(-60000, -2);
    });

    it('should clamp overflow to infinity', () => {
      const buffer = new HalfFloatBuffer(2);
      buffer.set(0, 100000); // Exceeds max half-float (~65504)
      buffer.set(1, -100000);

      expect(buffer.get(0)).toBe(Infinity);
      expect(buffer.get(1)).toBe(-Infinity);
    });
  });

  describe('Bulk Operations', () => {
    it('should convert to Float32Array', () => {
      const buffer = new HalfFloatBuffer(5);
      const testValues = [1.5, 2.5, 3.5, 4.5, 5.5];

      testValues.forEach((value, index) => {
        buffer.set(index, value);
      });

      const float32 = buffer.toFloat32Array();
      expect(float32.length).toBe(5);

      testValues.forEach((value, index) => {
        expect(float32[index]).toBeCloseTo(value, 1);
      });
    });

    it('should cache Float32Array conversion', () => {
      const buffer = new HalfFloatBuffer(100);
      buffer.fill(42);

      const first = buffer.toFloat32Array();
      const second = buffer.toFloat32Array();

      // Should return same cached instance
      expect(first).toBe(second);
    });

    it('should invalidate cache on modification', () => {
      const buffer = new HalfFloatBuffer(10);
      buffer.fill(1);

      const first = buffer.toFloat32Array();
      buffer.set(0, 99);
      const second = buffer.toFloat32Array();

      // Cache should be invalidated
      expect(first).not.toBe(second);
      expect(first[0]).toBeCloseTo(1, 1);
      expect(second[0]).toBeCloseTo(99, 1);
    });

    it('should set from Float32Array', () => {
      const source = new Float32Array([10, 20, 30, 40, 50]);
      const buffer = new HalfFloatBuffer(10);

      buffer.setFromFloat32Array(source, 0, 2, 5);

      expect(buffer.get(2)).toBeCloseTo(10, 1);
      expect(buffer.get(3)).toBeCloseTo(20, 1);
      expect(buffer.get(4)).toBeCloseTo(30, 1);
      expect(buffer.get(5)).toBeCloseTo(40, 1);
      expect(buffer.get(6)).toBeCloseTo(50, 1);
    });

    it('should fill with value', () => {
      const buffer = new HalfFloatBuffer(10);
      buffer.fill(3.14);

      for (let i = 0; i < buffer.length; i++) {
        expect(buffer.get(i)).toBeCloseTo(3.14, 1);
      }
    });

    it('should fill range', () => {
      const buffer = new HalfFloatBuffer(10);
      buffer.fill(0);
      buffer.fill(42, 3, 7);

      expect(buffer.get(2)).toBe(0);
      expect(buffer.get(3)).toBeCloseTo(42, 1);
      expect(buffer.get(6)).toBeCloseTo(42, 1);
      expect(buffer.get(7)).toBe(0);
    });

    it('should copy from another buffer', () => {
      const source = new HalfFloatBuffer(5);
      const dest = new HalfFloatBuffer(10);

      for (let i = 0; i < 5; i++) {
        source.set(i, i * 10);
      }

      dest.copyFrom(source, 2, 1, 4);

      expect(dest.get(2)).toBeCloseTo(10, 1);
      expect(dest.get(3)).toBeCloseTo(20, 1);
      expect(dest.get(4)).toBeCloseTo(30, 1);
    });

    it('should create subarray', () => {
      const buffer = new HalfFloatBuffer(10);
      for (let i = 0; i < 10; i++) {
        buffer.set(i, i * 5);
      }

      const sub = buffer.subarray(3, 7);
      expect(sub.length).toBe(4);
      expect(sub.get(0)).toBeCloseTo(15, 1);
      expect(sub.get(3)).toBeCloseTo(30, 1);
    });
  });

  describe('Precision Analysis', () => {
    it('should calculate precision loss', () => {
      const result = HalfFloatBuffer.getPrecisionLoss(123.456);

      expect(result.original).toBe(123.456);
      expect(result.encoded).toBeCloseTo(123.456, 1);
      expect(result.loss).toBeGreaterThan(0);
      expect(result.loss).toBeLessThan(0.1);
      expect(result.lossPercent).toBeLessThan(0.1);
    });

    it('should identify suitable values for half-float', () => {
      // DOM animation values (pixels, angles, opacity)
      expect(HalfFloatBuffer.isSuitableForHalfFloat(0)).toBe(true);
      expect(HalfFloatBuffer.isSuitableForHalfFloat(100)).toBe(true);
      expect(HalfFloatBuffer.isSuitableForHalfFloat(1920)).toBe(true);
      expect(HalfFloatBuffer.isSuitableForHalfFloat(360)).toBe(true);
      expect(HalfFloatBuffer.isSuitableForHalfFloat(0.5)).toBe(true);
      expect(HalfFloatBuffer.isSuitableForHalfFloat(1.0)).toBe(true);

      // Out of range values
      expect(HalfFloatBuffer.isSuitableForHalfFloat(100000)).toBe(false);
      expect(HalfFloatBuffer.isSuitableForHalfFloat(Infinity)).toBe(false);
      expect(HalfFloatBuffer.isSuitableForHalfFloat(NaN)).toBe(false);
    });

    it('should have acceptable precision for typical animation values', () => {
      const typicalValues = [
        { value: 0, name: 'zero position' },
        { value: 100, name: 'pixel position' },
        { value: 1920, name: 'screen width' },
        { value: 1080, name: 'screen height' },
        { value: 45, name: 'rotation angle' },
        { value: 180, name: 'rotation angle' },
        { value: 360, name: 'rotation angle' },
        { value: 1.0, name: 'scale' },
        { value: 2.0, name: 'scale' },
        { value: 0.5, name: 'opacity' },
        { value: 1.0, name: 'opacity' },
      ];

      typicalValues.forEach(({ value, name }) => {
        const { loss, lossPercent } = HalfFloatBuffer.getPrecisionLoss(value);

        // For DOM animations, loss should be imperceptible
        // (<0.1 pixel for positions, <0.1% for others)
        if (value > 10) {
          expect(loss).toBeLessThan(0.1); // Less than 0.1 pixel/degree
        }
        expect(lossPercent).toBeLessThan(0.1); // Less than 0.1%
      });
    });
  });

  describe('Factory Functions', () => {
    it('should create buffer from Float32Array', () => {
      const source = new Float32Array([1.1, 2.2, 3.3, 4.4, 5.5]);
      const buffer = createHalfFloatBufferFrom(source);

      expect(buffer.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(buffer.get(i)).toBeCloseTo(source[i], 1);
      }
    });
  });

  describe('Configuration', () => {
    it('should have default half-float components', () => {
      expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('x');
      expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('y');
      expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('z');
      expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('translateX');
      expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('rotateX');
      expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('scaleX');
      expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('opacity');
    });

    it('should check if component should use half-float', () => {
      // When disabled
      expect(shouldUseHalfFloat('x', { useHalfFloat: false })).toBe(false);

      // When enabled with defaults
      expect(shouldUseHalfFloat('x', { useHalfFloat: true })).toBe(true);
      expect(shouldUseHalfFloat('y', { useHalfFloat: true })).toBe(true);
      expect(shouldUseHalfFloat('opacity', { useHalfFloat: true })).toBe(true);

      // Non-standard component
      expect(shouldUseHalfFloat('customProp', { useHalfFloat: true })).toBe(false);

      // Custom component list
      expect(
        shouldUseHalfFloat('customProp', {
          useHalfFloat: true,
          halfFloatComponents: ['customProp'],
        }),
      ).toBe(true);
    });
  });

  describe('Memory Efficiency', () => {
    it('should use 50% less memory than Float32Array', () => {
      const size = 1000;
      const halfFloat = new HalfFloatBuffer(size);
      const float32 = new Float32Array(size);

      expect(halfFloat.byteLength).toBe(size * 2);
      expect(float32.byteLength).toBe(size * 4);
      expect(halfFloat.byteLength).toBe(float32.byteLength / 2);
    });

    it('should handle large buffers efficiently', () => {
      const size = 10000;
      const buffer = new HalfFloatBuffer(size);

      // Fill with typical animation data
      const start = performance.now();
      for (let i = 0; i < size; i++) {
        buffer.set(i, Math.random() * 1000);
      }
      const fillTime = performance.now() - start;

      // Conversion should be cached
      const convertStart = performance.now();
      const float32_1 = buffer.toFloat32Array();
      const firstConvert = performance.now() - convertStart;

      const cacheStart = performance.now();
      const float32_2 = buffer.toFloat32Array();
      const cachedConvert = performance.now() - cacheStart;

      expect(float32_1).toBe(float32_2); // Same instance
      expect(cachedConvert).toBeLessThan(firstConvert / 10); // Much faster
      expect(fillTime).toBeLessThan(100); // Reasonable performance
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty buffer', () => {
      const buffer = new HalfFloatBuffer(0);
      expect(buffer.length).toBe(0);
      expect(buffer.byteLength).toBe(0);

      const float32 = buffer.toFloat32Array();
      expect(float32.length).toBe(0);
    });

    it('should handle repeated set/get operations', () => {
      const buffer = new HalfFloatBuffer(1);

      for (let i = 0; i < 100; i++) {
        buffer.set(0, i);
        expect(buffer.get(0)).toBeCloseTo(i, 1);
      }
    });

    it('should maintain precision for zero-fill', () => {
      const buffer = new HalfFloatBuffer(100);
      buffer.fill(0);

      for (let i = 0; i < buffer.length; i++) {
        expect(buffer.get(i)).toBe(0);
      }
    });
  });
});
