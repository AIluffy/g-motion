/**
 * Property-Based Test: Gradient Stop Interpolation
 *
 * **Feature: enhanced-motion-capabilities, Property 7: Gradient Stop Interpolation**
 * **Validates: Requirements 2.2, 2.3**
 *
 * This test verifies that for any two gradients with the same number of stops,
 * interpolating at progress 0 returns the first gradient, and at progress 1
 * returns the second gradient.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  GradientParser,
  GradientValue,
  GradientStop,
  normalizeStops,
  matchStopCounts,
  interpolateStop,
} from '@g-motion/values';
import { ColorValue } from '@g-motion/values';

describe('Property 7: Gradient Stop Interpolation', () => {
  const parser = new GradientParser();

  // Tolerance for floating-point comparisons
  const COLOR_TOLERANCE = 1;
  const POSITION_TOLERANCE = 0.01;
  const ANGLE_TOLERANCE = 0.01;

  /**
   * Helper to check if two colors are equivalent
   */
  function colorsAreEquivalent(a: ColorValue, b: ColorValue): boolean {
    return (
      Math.abs(a.r - b.r) <= COLOR_TOLERANCE &&
      Math.abs(a.g - b.g) <= COLOR_TOLERANCE &&
      Math.abs(a.b - b.b) <= COLOR_TOLERANCE &&
      Math.abs(a.a - b.a) <= POSITION_TOLERANCE
    );
  }

  /**
   * Helper to check if two stops are equivalent
   */
  function stopsAreEquivalent(a: GradientStop, b: GradientStop): boolean {
    if (!colorsAreEquivalent(a.color, b.color)) return false;

    if (a.position === undefined && b.position === undefined) return true;
    if (a.position === undefined || b.position === undefined) return false;

    return Math.abs(a.position - b.position) <= POSITION_TOLERANCE;
  }

  // ============================================================================
  // Arbitraries for generating valid gradient values
  // ============================================================================

  /** Generate valid RGB channel value (0-255) */
  const rgbChannel = fc.integer({ min: 0, max: 255 });

  /** Generate valid alpha value (0-1) */
  const alphaValue = fc.double({ min: 0, max: 1, noNaN: true });

  /** Generate valid position percentage (0-100) */
  const positionValue = fc.double({ min: 0, max: 100, noNaN: true });

  /** Generate valid angle (0-360) */
  const angleValue = fc.double({ min: 0, max: 360, noNaN: true });

  /** Generate a color value */
  const colorValue: fc.Arbitrary<ColorValue> = fc
    .tuple(rgbChannel, rgbChannel, rgbChannel, alphaValue)
    .map(([r, g, b, a]) => ({ r, g, b, a }));

  /** Generate a gradient stop with position */
  const gradientStopWithPosition: fc.Arbitrary<GradientStop> = fc
    .tuple(colorValue, positionValue)
    .map(([color, position]) => ({ color, position }));

  /** Generate a gradient stop without position */
  const gradientStopWithoutPosition: fc.Arbitrary<GradientStop> = colorValue.map((color) => ({
    color,
  }));

  /** Generate a gradient stop (with or without position) */
  const gradientStop: fc.Arbitrary<GradientStop> = fc.oneof(
    gradientStopWithPosition,
    gradientStopWithoutPosition,
  );

  /** Generate an array of gradient stops (2-5 stops) */
  const gradientStops: fc.Arbitrary<GradientStop[]> = fc.array(gradientStop, {
    minLength: 2,
    maxLength: 5,
  });

  /** Generate a linear gradient value */
  const linearGradient: fc.Arbitrary<GradientValue> = fc
    .tuple(angleValue, gradientStops)
    .map(([angle, stops]) => ({
      type: 'linear' as const,
      angle,
      stops,
    }));

  /** Generate a linear gradient CSS string */
  const linearGradientString: fc.Arbitrary<string> = fc
    .tuple(
      angleValue,
      fc.array(fc.tuple(rgbChannel, rgbChannel, rgbChannel, fc.option(positionValue)), {
        minLength: 2,
        maxLength: 4,
      }),
    )
    .map(([angle, stops]) => {
      const stopsStr = stops
        .map(([r, g, b, pos]) => {
          const colorStr = `rgb(${r}, ${g}, ${b})`;
          return pos !== null ? `${colorStr} ${pos.toFixed(1)}%` : colorStr;
        })
        .join(', ');
      return `linear-gradient(${angle.toFixed(1)}deg, ${stopsStr})`;
    });

  /** Generate a radial gradient CSS string */
  const radialGradientString: fc.Arbitrary<string> = fc
    .array(fc.tuple(rgbChannel, rgbChannel, rgbChannel, fc.option(positionValue)), {
      minLength: 2,
      maxLength: 4,
    })
    .map((stops) => {
      const stopsStr = stops
        .map(([r, g, b, pos]) => {
          const colorStr = `rgb(${r}, ${g}, ${b})`;
          return pos !== null ? `${colorStr} ${pos.toFixed(1)}%` : colorStr;
        })
        .join(', ');
      return `radial-gradient(circle, ${stopsStr})`;
    });

  /** Generate any gradient CSS string */
  const anyGradientString = fc.oneof(linearGradientString, radialGradientString);

  // ============================================================================
  // Property Tests
  // ============================================================================

  /**
   * Property: Interpolation at progress 0 returns first gradient's stops
   * Validates: Requirement 2.2 (gradient interpolation)
   */
  it('should return first gradient stops at progress 0', () => {
    fc.assert(
      fc.property(linearGradient, linearGradient, (from, to) => {
        const result = parser.interpolate(from, to, 0);

        // Normalize stops for comparison
        const [fromNorm] = matchStopCounts(from.stops, to.stops);
        const resultNorm = normalizeStops(result.stops);

        // Each stop should match the 'from' gradient
        for (let i = 0; i < Math.min(fromNorm.length, resultNorm.length); i++) {
          expect(colorsAreEquivalent(resultNorm[i].color, fromNorm[i].color)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress 1 returns second gradient's stops
   * Validates: Requirement 2.2 (gradient interpolation)
   */
  it('should return second gradient stops at progress 1', () => {
    fc.assert(
      fc.property(linearGradient, linearGradient, (from, to) => {
        const result = parser.interpolate(from, to, 1);

        // Normalize stops for comparison
        const [, toNorm] = matchStopCounts(from.stops, to.stops);
        const resultNorm = normalizeStops(result.stops);

        // Each stop should match the 'to' gradient
        for (let i = 0; i < Math.min(toNorm.length, resultNorm.length); i++) {
          expect(colorsAreEquivalent(resultNorm[i].color, toNorm[i].color)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Angle interpolation at progress 0 returns first angle
   * Validates: Requirement 2.3 (angle interpolation)
   */
  it('should return first gradient angle at progress 0', () => {
    fc.assert(
      fc.property(linearGradient, linearGradient, (from, to) => {
        const result = parser.interpolate(from, to, 0);

        if (from.angle !== undefined && to.angle !== undefined) {
          expect(Math.abs(result.angle! - from.angle)).toBeLessThanOrEqual(ANGLE_TOLERANCE);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Angle interpolation at progress 1 returns second angle
   * Validates: Requirement 2.3 (angle interpolation)
   */
  it('should return second gradient angle at progress 1', () => {
    fc.assert(
      fc.property(linearGradient, linearGradient, (from, to) => {
        const result = parser.interpolate(from, to, 1);

        if (from.angle !== undefined && to.angle !== undefined) {
          expect(Math.abs(result.angle! - to.angle)).toBeLessThanOrEqual(ANGLE_TOLERANCE);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Stop interpolation produces values within bounds
   * Validates: Requirement 2.2 (interpolation bounds)
   */
  it('should keep interpolated stop values within bounds', () => {
    fc.assert(
      fc.property(
        gradientStopWithPosition,
        gradientStopWithPosition,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (from, to, progress) => {
          const result = interpolateStop(from, to, progress);

          // Color channels should be within bounds
          expect(result.color.r).toBeGreaterThanOrEqual(
            Math.min(from.color.r, to.color.r) - COLOR_TOLERANCE,
          );
          expect(result.color.r).toBeLessThanOrEqual(
            Math.max(from.color.r, to.color.r) + COLOR_TOLERANCE,
          );

          expect(result.color.g).toBeGreaterThanOrEqual(
            Math.min(from.color.g, to.color.g) - COLOR_TOLERANCE,
          );
          expect(result.color.g).toBeLessThanOrEqual(
            Math.max(from.color.g, to.color.g) + COLOR_TOLERANCE,
          );

          expect(result.color.b).toBeGreaterThanOrEqual(
            Math.min(from.color.b, to.color.b) - COLOR_TOLERANCE,
          );
          expect(result.color.b).toBeLessThanOrEqual(
            Math.max(from.color.b, to.color.b) + COLOR_TOLERANCE,
          );

          // Position should be within bounds
          if (result.position !== undefined) {
            expect(result.position).toBeGreaterThanOrEqual(
              Math.min(from.position!, to.position!) - POSITION_TOLERANCE,
            );
            expect(result.position).toBeLessThanOrEqual(
              Math.max(from.position!, to.position!) + POSITION_TOLERANCE,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Normalized stops have explicit positions
   * Validates: Requirement 2.2 (stop normalization)
   */
  it('should normalize stops to have explicit positions', () => {
    fc.assert(
      fc.property(gradientStops, (stops) => {
        const normalized = normalizeStops(stops);

        // All normalized stops should have positions
        for (const stop of normalized) {
          expect(stop.position).toBeDefined();
          expect(typeof stop.position).toBe('number');
          expect(stop.position).toBeGreaterThanOrEqual(0);
          expect(stop.position).toBeLessThanOrEqual(100);
        }

        // First stop should be at 0 or greater
        if (normalized.length > 0) {
          expect(normalized[0].position).toBeGreaterThanOrEqual(0);
        }

        // Last stop should be at 100 or less
        if (normalized.length > 0) {
          expect(normalized[normalized.length - 1].position).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Matched stop counts are equal
   * Validates: Requirement 2.2 (stop count matching)
   */
  it('should match stop counts between gradients', () => {
    fc.assert(
      fc.property(gradientStops, gradientStops, (from, to) => {
        const [fromMatched, toMatched] = matchStopCounts(from, to);

        expect(fromMatched.length).toBe(toMatched.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Gradient detection is consistent
   * Validates: Requirement 2.2 (consistent detection)
   */
  it('should consistently detect valid gradients', () => {
    fc.assert(
      fc.property(anyGradientString, (gradient) => {
        const detected1 = parser.detect(gradient);
        const detected2 = parser.detect(gradient);
        const detected3 = parser.detect(gradient);

        expect(detected1).toBe(true);
        expect(detected2).toBe(true);
        expect(detected3).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Gradient parsing produces valid structure
   * Validates: Requirement 2.2, 2.3 (parsing)
   */
  it('should parse gradients into valid structure', () => {
    fc.assert(
      fc.property(anyGradientString, (gradient) => {
        const parsed = parser.parse(gradient);

        expect(parsed.type).toBe('gradient');
        expect(parsed.value).toBeDefined();
        expect(parsed.value.type).toMatch(/^(linear|radial|conic)$/);
        expect(Array.isArray(parsed.value.stops)).toBe(true);
        expect(parsed.value.stops.length).toBeGreaterThanOrEqual(2);

        // Each stop should have a valid color
        for (const stop of parsed.value.stops) {
          expect(stop.color).toBeDefined();
          expect(typeof stop.color.r).toBe('number');
          expect(typeof stop.color.g).toBe('number');
          expect(typeof stop.color.b).toBe('number');
          expect(typeof stop.color.a).toBe('number');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Serialization produces valid gradient string
   * Validates: Requirement 2.2 (serialization)
   */
  it('should serialize gradients to valid CSS strings', () => {
    fc.assert(
      fc.property(anyGradientString, (gradient) => {
        const parsed = parser.parse(gradient);
        const serialized = parser.serialize(parsed);

        // Should be a valid gradient string
        expect(typeof serialized).toBe('string');
        expect(parser.detect(serialized)).toBe(true);

        // Should be re-parseable
        const reparsed = parser.parse(serialized);
        expect(reparsed.value.type).toBe(parsed.value.type);
        expect(reparsed.value.stops.length).toBe(parsed.value.stops.length);
      }),
      { numRuns: 100 },
    );
  });
});
