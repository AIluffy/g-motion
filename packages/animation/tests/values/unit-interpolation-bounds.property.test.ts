/**
 * Property-Based Test: Interpolation Bounds
 *
 * **Feature: enhanced-motion-capabilities, Property 5: Interpolation Bounds**
 * **Validates: Requirements 5.4, 5.5**
 *
 * This test verifies that for any interpolation with progress in [0, 1],
 * the interpolated value SHALL be within the bounds defined by the start
 * and end values (for numeric types), and units are preserved.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { UnitParser, ALL_UNITS } from '../../src/values/parsers/unit';

describe('Property 5: Interpolation Bounds', () => {
  const parser = new UnitParser();

  /**
   * Arbitrary for generating valid unit values
   */
  const unitValueArb = fc.record({
    value: fc.double({ noNaN: true, noDefaultInfinity: true, min: -10000, max: 10000 }),
    unit: fc.constantFrom(...ALL_UNITS),
  });

  /**
   * Arbitrary for progress values in [0, 1]
   */
  const progressArb = fc.double({ min: 0, max: 1, noNaN: true });

  /**
   * Property: Interpolated value should be within bounds of from and to values
   * Validates: Requirement 5.4 (string values with embedded numbers)
   */
  it('should interpolate values within bounds of from and to', () => {
    fc.assert(
      fc.property(unitValueArb, unitValueArb, progressArb, (from, to, progress) => {
        const result = parser.interpolate(from, to, progress);

        const minValue = Math.min(from.value, to.value);
        const maxValue = Math.max(from.value, to.value);

        // Allow small floating point tolerance
        const tolerance = 1e-10;
        expect(result.value).toBeGreaterThanOrEqual(minValue - tolerance);
        expect(result.value).toBeLessThanOrEqual(maxValue + tolerance);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress=0 should return the 'from' value
   * Validates: Requirement 5.5 (preserve units during interpolation)
   */
  it('should return from value at progress 0', () => {
    fc.assert(
      fc.property(unitValueArb, unitValueArb, (from, to) => {
        const result = parser.interpolate(from, to, 0);

        expect(result.value).toBeCloseTo(from.value, 10);
        expect(result.unit).toBe(from.unit);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress=1 should return the 'to' value
   * Validates: Requirement 5.5 (preserve units during interpolation)
   */
  it('should return to value at progress 1', () => {
    fc.assert(
      fc.property(unitValueArb, unitValueArb, (from, to) => {
        const result = parser.interpolate(from, to, 1);

        expect(result.value).toBeCloseTo(to.value, 10);
        // Unit is preserved from 'from' value
        expect(result.unit).toBe(from.unit);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Unit should be preserved during interpolation
   * Validates: Requirement 5.5 (preserve units during interpolation)
   */
  it('should preserve unit from the from value during interpolation', () => {
    fc.assert(
      fc.property(unitValueArb, unitValueArb, progressArb, (from, to, progress) => {
        const result = parser.interpolate(from, to, progress);

        // Unit should always be preserved from the 'from' value
        expect(result.unit).toBe(from.unit);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress=0.5 should be the midpoint
   * Validates: Requirement 5.4, 5.5
   */
  it('should return midpoint value at progress 0.5', () => {
    fc.assert(
      fc.property(unitValueArb, unitValueArb, (from, to) => {
        const result = parser.interpolate(from, to, 0.5);

        const expectedMidpoint = (from.value + to.value) / 2;
        expect(result.value).toBeCloseTo(expectedMidpoint, 10);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Parsing and serializing should produce valid unit strings
   * Validates: Requirement 5.4 (string values with embedded numbers)
   *
   * Note: We use integers to avoid floating point precision issues
   * and scientific notation (e.g., 5e-324) which are not valid CSS unit values.
   */
  it('should parse and serialize unit values correctly', () => {
    fc.assert(
      fc.property(
        // Use integers to avoid scientific notation issues with very small/large floats
        fc.integer({ min: -10000, max: 10000 }),
        fc.constantFrom(...ALL_UNITS),
        (value, unit) => {
          const input = `${value}${unit}`;

          // Should detect as unit value
          expect(parser.detect(input)).toBe(true);

          // Should parse correctly
          const parsed = parser.parse(input);
          expect(parsed.type).toBe('unit');
          expect(parsed.value.unit).toBe(unit);
          expect(parsed.value.value).toBe(value);

          // Should serialize back to a valid unit string
          const serialized = parser.serialize(parsed);
          expect(typeof serialized).toBe('string');
          expect(parser.detect(serialized)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Linear interpolation should be monotonic
   * Validates: Requirement 5.4, 5.5
   */
  it('should produce monotonic interpolation results', () => {
    fc.assert(
      fc.property(
        unitValueArb,
        unitValueArb,
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        (from, to, progress1, progress2) => {
          const result1 = parser.interpolate(from, to, progress1);
          const result2 = parser.interpolate(from, to, progress2);

          // If from < to, result should increase with progress
          // If from > to, result should decrease with progress
          if (from.value <= to.value) {
            expect(result1.value).toBeLessThanOrEqual(result2.value + 1e-10);
          } else {
            expect(result1.value).toBeGreaterThanOrEqual(result2.value - 1e-10);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
