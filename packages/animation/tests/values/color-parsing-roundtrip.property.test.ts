/**
 * Property-Based Test: Color Parsing Round Trip
 *
 * **Feature: enhanced-motion-capabilities, Property 1: Color Parsing Round Trip**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.6**
 *
 * This test verifies that for any valid color string (hex, rgb, rgba, hsl, hsla),
 * parsing then serializing produces a color that is visually equivalent
 * (within floating-point tolerance).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ColorParser,
  ColorValue,
  rgbToHsl,
  hslToRgb,
  hexToRgba,
  rgbaToHex,
  interpolateRgb,
  interpolateHsl,
} from '../../src/values/parsers/color';

describe('Property 1: Color Parsing Round Trip', () => {
  const parser = new ColorParser();

  // Tolerance for floating-point comparisons
  const COLOR_TOLERANCE = 1; // Allow 1 unit difference in RGB channels (0-255)
  const ALPHA_TOLERANCE = 0.01; // Allow 1% difference in alpha

  /**
   * Helper to check if two colors are visually equivalent
   */
  function colorsAreEquivalent(a: ColorValue, b: ColorValue): boolean {
    return (
      Math.abs(a.r - b.r) <= COLOR_TOLERANCE &&
      Math.abs(a.g - b.g) <= COLOR_TOLERANCE &&
      Math.abs(a.b - b.b) <= COLOR_TOLERANCE &&
      Math.abs(a.a - b.a) <= ALPHA_TOLERANCE
    );
  }

  // ============================================================================
  // Arbitraries for generating valid color values
  // ============================================================================

  /** Generate valid RGB channel value (0-255) */
  const rgbChannel = fc.integer({ min: 0, max: 255 });

  /** Generate valid alpha value (0-1) */
  const alphaValue = fc.double({ min: 0, max: 1, noNaN: true });

  /** Generate valid hue value (0-360) */
  const hueValue = fc.double({ min: 0, max: 360, noNaN: true });

  /** Generate valid saturation/lightness percentage (0-100) */
  const percentValue = fc.double({ min: 0, max: 100, noNaN: true });

  /** Generate hex color string (#RGB, #RRGGBB, #RGBA, #RRGGBBAA) */
  const hexColor = fc.oneof(
    // #RGB
    fc.tuple(rgbChannel, rgbChannel, rgbChannel).map(([r, g, b]) => {
      const toHex = (n: number) => Math.round(n / 17).toString(16);
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }),
    // #RRGGBB
    fc.tuple(rgbChannel, rgbChannel, rgbChannel).map(([r, g, b]) => {
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }),
    // #RRGGBBAA
    fc.tuple(rgbChannel, rgbChannel, rgbChannel, rgbChannel).map(([r, g, b, a]) => {
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
    }),
  );

  /** Generate rgb() color string */
  const rgbColor = fc
    .tuple(rgbChannel, rgbChannel, rgbChannel)
    .map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`);

  /** Generate rgba() color string */
  const rgbaColor = fc
    .tuple(rgbChannel, rgbChannel, rgbChannel, alphaValue)
    .map(([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`);

  /** Generate hsl() color string */
  const hslColor = fc
    .tuple(hueValue, percentValue, percentValue)
    .map(([h, s, l]) => `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`);

  /** Generate hsla() color string */
  const hslaColor = fc
    .tuple(hueValue, percentValue, percentValue, alphaValue)
    .map(
      ([h, s, l, a]) =>
        `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${a.toFixed(2)})`,
    );

  /** Generate any valid color string */
  const anyColor = fc.oneof(hexColor, rgbColor, rgbaColor, hslColor, hslaColor);

  // ============================================================================
  // Property Tests
  // ============================================================================

  /**
   * Property: Hex color round trip
   * Validates: Requirement 5.1 (hex format parsing)
   */
  it('should round-trip hex colors correctly', () => {
    fc.assert(
      fc.property(hexColor, (color) => {
        const parsed = parser.parse(color);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(colorsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: RGB color round trip
   * Validates: Requirement 5.2 (rgb/rgba format parsing)
   */
  it('should round-trip rgb colors correctly', () => {
    fc.assert(
      fc.property(rgbColor, (color) => {
        const parsed = parser.parse(color);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(colorsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: RGBA color round trip
   * Validates: Requirement 5.2 (rgb/rgba format parsing)
   */
  it('should round-trip rgba colors correctly', () => {
    fc.assert(
      fc.property(rgbaColor, (color) => {
        const parsed = parser.parse(color);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(colorsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: HSL color round trip
   * Validates: Requirement 5.3 (hsl/hsla format parsing)
   */
  it('should round-trip hsl colors correctly', () => {
    fc.assert(
      fc.property(hslColor, (color) => {
        const parsed = parser.parse(color);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(colorsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: HSLA color round trip
   * Validates: Requirement 5.3 (hsl/hsla format parsing)
   */
  it('should round-trip hsla colors correctly', () => {
    fc.assert(
      fc.property(hslaColor, (color) => {
        const parsed = parser.parse(color);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(colorsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Any valid color round trip
   * Validates: Requirement 5.6 (round-trip property)
   */
  it('should round-trip any valid color correctly', () => {
    fc.assert(
      fc.property(anyColor, (color) => {
        const parsed = parser.parse(color);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(colorsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: RGB to HSL to RGB conversion is consistent
   * Validates: Requirement 5.3 (HSL color space)
   */
  it('should convert RGB to HSL and back consistently', () => {
    fc.assert(
      fc.property(rgbChannel, rgbChannel, rgbChannel, (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const [r2, g2, b2] = hslToRgb(h, s, l);

        expect(Math.abs(r - r2)).toBeLessThanOrEqual(COLOR_TOLERANCE);
        expect(Math.abs(g - g2)).toBeLessThanOrEqual(COLOR_TOLERANCE);
        expect(Math.abs(b - b2)).toBeLessThanOrEqual(COLOR_TOLERANCE);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Hex to RGBA and back is consistent
   * Validates: Requirement 5.1 (hex format)
   */
  it('should convert hex to RGBA and back consistently', () => {
    fc.assert(
      fc.property(rgbChannel, rgbChannel, rgbChannel, (r, g, b) => {
        const hex = rgbaToHex(r, g, b);
        const [r2, g2, b2] = hexToRgba(hex);

        expect(r2).toBe(r);
        expect(g2).toBe(g);
        expect(b2).toBe(b);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress 0 returns start color
   * Validates: Requirement 5.2 (interpolation)
   */
  it('should return start color at progress 0', () => {
    fc.assert(
      fc.property(
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        (r1, g1, b1, a1, r2, g2, b2, a2) => {
          const from: ColorValue = { r: r1, g: g1, b: b1, a: a1 };
          const to: ColorValue = { r: r2, g: g2, b: b2, a: a2 };

          const result = interpolateRgb(from, to, 0);

          expect(colorsAreEquivalent(result, from)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress 1 returns end color
   * Validates: Requirement 5.2 (interpolation)
   */
  it('should return end color at progress 1', () => {
    fc.assert(
      fc.property(
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        (r1, g1, b1, a1, r2, g2, b2, a2) => {
          const from: ColorValue = { r: r1, g: g1, b: b1, a: a1 };
          const to: ColorValue = { r: r2, g: g2, b: b2, a: a2 };

          const result = interpolateRgb(from, to, 1);

          expect(colorsAreEquivalent(result, to)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: HSL interpolation at progress 0 returns start color
   * Validates: Requirement 5.3 (HSL interpolation)
   */
  it('should return start color at progress 0 for HSL interpolation', () => {
    fc.assert(
      fc.property(
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        (r1, g1, b1, a1, r2, g2, b2, a2) => {
          const from: ColorValue = { r: r1, g: g1, b: b1, a: a1 };
          const to: ColorValue = { r: r2, g: g2, b: b2, a: a2 };

          const result = interpolateHsl(from, to, 0);

          // HSL conversion may introduce small rounding errors
          expect(Math.abs(result.r - from.r)).toBeLessThanOrEqual(COLOR_TOLERANCE);
          expect(Math.abs(result.g - from.g)).toBeLessThanOrEqual(COLOR_TOLERANCE);
          expect(Math.abs(result.b - from.b)).toBeLessThanOrEqual(COLOR_TOLERANCE);
          expect(Math.abs(result.a - from.a)).toBeLessThanOrEqual(ALPHA_TOLERANCE);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: HSL interpolation at progress 1 returns end color
   * Validates: Requirement 5.3 (HSL interpolation)
   */
  it('should return end color at progress 1 for HSL interpolation', () => {
    fc.assert(
      fc.property(
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        (r1, g1, b1, a1, r2, g2, b2, a2) => {
          const from: ColorValue = { r: r1, g: g1, b: b1, a: a1 };
          const to: ColorValue = { r: r2, g: g2, b: b2, a: a2 };

          const result = interpolateHsl(from, to, 1);

          // HSL conversion may introduce small rounding errors
          expect(Math.abs(result.r - to.r)).toBeLessThanOrEqual(COLOR_TOLERANCE);
          expect(Math.abs(result.g - to.g)).toBeLessThanOrEqual(COLOR_TOLERANCE);
          expect(Math.abs(result.b - to.b)).toBeLessThanOrEqual(COLOR_TOLERANCE);
          expect(Math.abs(result.a - to.a)).toBeLessThanOrEqual(ALPHA_TOLERANCE);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolated values are within bounds
   * Validates: Requirement 5.2 (interpolation bounds)
   */
  it('should keep interpolated values within valid bounds', () => {
    fc.assert(
      fc.property(
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        rgbChannel,
        rgbChannel,
        rgbChannel,
        alphaValue,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (r1, g1, b1, a1, r2, g2, b2, a2, progress) => {
          const from: ColorValue = { r: r1, g: g1, b: b1, a: a1 };
          const to: ColorValue = { r: r2, g: g2, b: b2, a: a2 };

          const result = interpolateRgb(from, to, progress);

          // RGB channels should be within 0-255
          expect(result.r).toBeGreaterThanOrEqual(Math.min(r1, r2) - COLOR_TOLERANCE);
          expect(result.r).toBeLessThanOrEqual(Math.max(r1, r2) + COLOR_TOLERANCE);
          expect(result.g).toBeGreaterThanOrEqual(Math.min(g1, g2) - COLOR_TOLERANCE);
          expect(result.g).toBeLessThanOrEqual(Math.max(g1, g2) + COLOR_TOLERANCE);
          expect(result.b).toBeGreaterThanOrEqual(Math.min(b1, b2) - COLOR_TOLERANCE);
          expect(result.b).toBeLessThanOrEqual(Math.max(b1, b2) + COLOR_TOLERANCE);

          // Alpha should be within 0-1
          expect(result.a).toBeGreaterThanOrEqual(Math.min(a1, a2) - ALPHA_TOLERANCE);
          expect(result.a).toBeLessThanOrEqual(Math.max(a1, a2) + ALPHA_TOLERANCE);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Color detection is consistent
   * Validates: Requirement 5.6 (consistent detection)
   */
  it('should consistently detect valid colors', () => {
    fc.assert(
      fc.property(anyColor, (color) => {
        const detected1 = parser.detect(color);
        const detected2 = parser.detect(color);
        const detected3 = parser.detect(color);

        expect(detected1).toBe(true);
        expect(detected2).toBe(true);
        expect(detected3).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
