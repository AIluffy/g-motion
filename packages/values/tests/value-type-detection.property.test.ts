/**
 * Property-Based Test: Value Type Detection Consistency
 *
 * **Feature: enhanced-motion-capabilities, Property 6: Value Type Detection Consistency**
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 *
 * This test verifies that for any value, the detected value type is consistent
 * across multiple detection calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ValueParserRegistry } from '@g-motion/values';
import { ValueType } from '@g-motion/values';
import { NumberParser } from '@g-motion/values';
import { StringParser } from '@g-motion/values';

describe('Property 6: Value Type Detection Consistency', () => {
  let registry: ValueParserRegistry;

  beforeEach(() => {
    registry = new ValueParserRegistry();
    // Register parsers with appropriate priorities
    // Number parser has higher priority than string parser
    registry.register(new NumberParser(), { priority: 10 });
    registry.register(new StringParser(), { priority: 0 });
  });

  /**
   * Property: For any value, the detected value type SHALL be consistent
   * across multiple detection calls.
   */
  it('should detect the same type for the same value across multiple calls', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          fc.string(),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (value) => {
          // Detect the value type multiple times
          const detection1 = registry.detect(value);
          const detection2 = registry.detect(value);
          const detection3 = registry.detect(value);

          // All detections should return the same parser (or all undefined)
          if (detection1 === undefined) {
            expect(detection2).toBeUndefined();
            expect(detection3).toBeUndefined();
          } else {
            expect(detection2).toBeDefined();
            expect(detection3).toBeDefined();
            expect(detection1.type).toBe(detection2!.type);
            expect(detection1.type).toBe(detection3!.type);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Number values should always be detected as Number type
   * Validates: Requirement 8.3 (numeric value detection)
   */
  it('should consistently detect numeric values as Number type', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true })),
        (value) => {
          const parser = registry.detect(value);
          expect(parser).toBeDefined();
          expect(parser!.type).toBe(ValueType.Number);

          // Multiple detections should be consistent
          const parser2 = registry.detect(value);
          expect(parser2!.type).toBe(ValueType.Number);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: String values (that are not numbers) should be detected as String type
   * Validates: Requirement 8.6 (fallback to string)
   */
  it('should consistently detect non-numeric strings as String type', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          // Filter out strings that are valid numbers
          const trimmed = s.trim();
          if (trimmed === '') return true; // Empty strings are not numbers
          const num = Number(trimmed);
          return Number.isNaN(num) || trimmed !== String(num);
        }),
        (value) => {
          const parser = registry.detect(value);
          expect(parser).toBeDefined();
          expect(parser!.type).toBe(ValueType.String);

          // Multiple detections should be consistent
          const parser2 = registry.detect(value);
          expect(parser2!.type).toBe(ValueType.String);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Detection with confidence should return consistent results
   */
  it('should return consistent detection results with confidence', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.string()),
        (value) => {
          const result1 = registry.detectWithConfidence(value);
          const result2 = registry.detectWithConfidence(value);

          if (result1 === undefined) {
            expect(result2).toBeUndefined();
          } else {
            expect(result2).toBeDefined();
            expect(result1.type).toBe(result2!.type);
            expect(result1.confidence).toBe(result2!.confidence);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Parsing should be consistent with detection
   */
  it('should parse values consistently with their detected type', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.string()),
        (value) => {
          const parser = registry.detect(value);

          if (parser) {
            const parsed1 = registry.parse(value);
            const parsed2 = registry.parse(value);

            expect(parsed1.type).toBe(parsed2.type);
            expect(parsed1.type).toBe(parser.type);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
