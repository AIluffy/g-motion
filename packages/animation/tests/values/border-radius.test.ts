/**
 * Border Radius Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { borderRadiusParser, BorderRadiusValue } from '../../src/values/parsers/border-radius';

describe('BorderRadiusParser', () => {
  describe('detect', () => {
    it('should detect single values', () => {
      expect(borderRadiusParser.detect('10px')).toBe(true);
      expect(borderRadiusParser.detect('50%')).toBe(true);
      expect(borderRadiusParser.detect('1em')).toBe(true);
    });

    it('should detect multiple values', () => {
      expect(borderRadiusParser.detect('10px 20px')).toBe(true);
      expect(borderRadiusParser.detect('10px 20px 30px')).toBe(true);
      expect(borderRadiusParser.detect('10px 20px 30px 40px')).toBe(true);
    });

    it('should detect elliptical values', () => {
      expect(borderRadiusParser.detect('10px / 20px')).toBe(true);
      expect(borderRadiusParser.detect('10px 20px / 30px 40px')).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(borderRadiusParser.detect('invalid')).toBe(false);
      expect(borderRadiusParser.detect('')).toBe(false);
      expect(borderRadiusParser.detect(123)).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse single values', () => {
      const result = borderRadiusParser.parse('10px');
      expect(result.type).toBe('unit');
      expect(result.value.topLeft.horizontal.value).toBe(10);
      expect(result.value.topLeft.horizontal.unit).toBe('px');
      expect(result.value.topLeft.vertical.value).toBe(10);
      expect(result.value.topLeft.vertical.unit).toBe('px');
    });

    it('should parse multiple values', () => {
      const result = borderRadiusParser.parse('10px 20px 30px 40px');
      expect(result.value.topLeft.horizontal.value).toBe(10);
      expect(result.value.topRight.horizontal.value).toBe(20);
      expect(result.value.bottomRight.horizontal.value).toBe(30);
      expect(result.value.bottomLeft.horizontal.value).toBe(40);
    });

    it('should parse elliptical values', () => {
      const result = borderRadiusParser.parse('10px / 20px');
      expect(result.value.topLeft.horizontal.value).toBe(10);
      expect(result.value.topLeft.vertical.value).toBe(20);
    });

    it('should handle values without units (assume px)', () => {
      const result = borderRadiusParser.parse('10');
      expect(result.value.topLeft.horizontal.value).toBe(10);
      expect(result.value.topLeft.horizontal.unit).toBe('px');
    });
  });

  describe('serialize', () => {
    it('should serialize single values', () => {
      const parsed = borderRadiusParser.parse('10px');
      const serialized = borderRadiusParser.serialize(parsed);
      expect(serialized).toBe('10px');
    });

    it('should serialize elliptical single values', () => {
      const parsed = borderRadiusParser.parse('10px / 20px');
      const serialized = borderRadiusParser.serialize(parsed);
      expect(serialized).toBe('10px / 20px');
    });

    it('should serialize multiple values', () => {
      const parsed = borderRadiusParser.parse('10px 20px 30px 40px');
      const serialized = borderRadiusParser.serialize(parsed);
      expect(serialized).toBe('10px 20px 30px 40px');
    });
  });

  describe('interpolate', () => {
    it('should interpolate between single values', () => {
      const from = borderRadiusParser.parse('10px').value;
      const to = borderRadiusParser.parse('20px').value;
      const result = borderRadiusParser.interpolate(from, to, 0.5);

      expect(result.topLeft.horizontal.value).toBe(15);
      expect(result.topLeft.horizontal.unit).toBe('px');
    });

    it('should interpolate between different units', () => {
      const from = borderRadiusParser.parse('10px').value;
      const to = borderRadiusParser.parse('20px').value;
      const context = { elementWidth: 100, elementHeight: 100 };
      const result = borderRadiusParser.interpolate(from, to, 0.5, context);

      expect(result.topLeft.horizontal.value).toBe(15);
      expect(result.topLeft.horizontal.unit).toBe('px');
    });

    it('should interpolate elliptical values', () => {
      const from = borderRadiusParser.parse('10px / 20px').value;
      const to = borderRadiusParser.parse('20px / 40px').value;
      const result = borderRadiusParser.interpolate(from, to, 0.5);

      expect(result.topLeft.horizontal.value).toBe(15);
      expect(result.topLeft.vertical.value).toBe(30);
    });
  });
});
