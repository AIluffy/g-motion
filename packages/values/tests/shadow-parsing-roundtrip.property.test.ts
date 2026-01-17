/**
 * Property-Based Test: Shadow Parsing Round Trip
 *
 * **Feature: enhanced-motion-capabilities, Property 3: Shadow Parsing Round Trip**
 * **Validates: Requirements 10.1, 10.3, 10.6**
 *
 * This test verifies that for any valid box-shadow or text-shadow string,
 * parsing then serializing produces an equivalent shadow string.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ShadowParser, ShadowValue, ShadowsValue, normalizeShadowCounts } from '@g-motion/values';

describe('Property 3: Shadow Parsing Round Trip', () => {
  const parser = new ShadowParser();

  // Tolerance for floating-point comparisons
  const LENGTH_TOLERANCE = 0.01;
  const COLOR_TOLERANCE = 1;
  const ALPHA_TOLERANCE = 0.01;

  /**
   * Helper to check if two shadows are equivalent
   */
  function shadowsAreEquivalent(a: ShadowValue, b: ShadowValue): boolean {
    const offsetXMatch = Math.abs(a.offsetX - b.offsetX) <= LENGTH_TOLERANCE;
    const offsetYMatch = Math.abs(a.offsetY - b.offsetY) <= LENGTH_TOLERANCE;
    const blurMatch = Math.abs(a.blur - b.blur) <= LENGTH_TOLERANCE;
    const spreadMatch =
      (a.spread === undefined && b.spread === undefined) ||
      (a.spread !== undefined &&
        b.spread !== undefined &&
        Math.abs(a.spread - b.spread) <= LENGTH_TOLERANCE);
    const colorMatch =
      Math.abs(a.color.r - b.color.r) <= COLOR_TOLERANCE &&
      Math.abs(a.color.g - b.color.g) <= COLOR_TOLERANCE &&
      Math.abs(a.color.b - b.color.b) <= COLOR_TOLERANCE &&
      Math.abs(a.color.a - b.color.a) <= ALPHA_TOLERANCE;
    const insetMatch = a.inset === b.inset;

    return offsetXMatch && offsetYMatch && blurMatch && spreadMatch && colorMatch && insetMatch;
  }

  /**
   * Helper to check if two shadow arrays are equivalent
   */
  function shadowArraysAreEquivalent(a: ShadowValue[], b: ShadowValue[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((shadow, i) => shadowsAreEquivalent(shadow, b[i]));
  }

  // ============================================================================
  // Arbitraries for generating valid shadow values
  // ============================================================================

  /** Generate valid length value (pixels) */
  const lengthValue = fc.integer({ min: -100, max: 100 });

  /** Generate valid positive length value (for blur/spread) */
  const positiveLengthValue = fc.integer({ min: 0, max: 100 });

  /** Generate valid RGB channel value (0-255) */
  const rgbChannel = fc.integer({ min: 0, max: 255 });

  /** Generate valid alpha value (0-1) */
  const alphaValue = fc.double({ min: 0, max: 1, noNaN: true });

  /** Generate a color string */
  const colorString = fc.oneof(
    // rgb()
    fc.tuple(rgbChannel, rgbChannel, rgbChannel).map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`),
    // rgba()
    fc
      .tuple(rgbChannel, rgbChannel, rgbChannel, alphaValue)
      .map(([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`),
    // hex
    fc.tuple(rgbChannel, rgbChannel, rgbChannel).map(([r, g, b]) => {
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }),
  );

  /** Generate a single box-shadow string */
  const boxShadowString = fc
    .tuple(
      fc.boolean(), // inset
      lengthValue, // offset-x
      lengthValue, // offset-y
      positiveLengthValue, // blur
      lengthValue, // spread
      colorString, // color
    )
    .map(([inset, offsetX, offsetY, blur, spread, color]) => {
      const parts: string[] = [];
      if (inset) parts.push('inset');
      parts.push(`${offsetX}px`);
      parts.push(`${offsetY}px`);
      parts.push(`${blur}px`);
      parts.push(`${spread}px`);
      parts.push(color);
      return parts.join(' ');
    });

  /** Generate a single text-shadow string */
  const textShadowString = fc
    .tuple(
      lengthValue, // offset-x
      lengthValue, // offset-y
      positiveLengthValue, // blur
      colorString, // color
    )
    .map(([offsetX, offsetY, blur, color]) => {
      return `${offsetX}px ${offsetY}px ${blur}px ${color}`;
    });

  /** Generate multiple box-shadows */
  const multipleBoxShadows = fc
    .array(boxShadowString, { minLength: 1, maxLength: 3 })
    .map((shadows) => shadows.join(', '));

  /** Generate multiple text-shadows */
  const multipleTextShadows = fc
    .array(textShadowString, { minLength: 1, maxLength: 3 })
    .map((shadows) => shadows.join(', '));

  // ============================================================================
  // Property Tests
  // ============================================================================

  /**
   * Property: Single box-shadow round trip
   * Validates: Requirement 10.1 (box-shadow parsing)
   */
  it('should round-trip single box-shadow correctly', () => {
    fc.assert(
      fc.property(boxShadowString, (shadow) => {
        const parsed = parser.parse(shadow);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(shadowArraysAreEquivalent(parsed.value.shadows, reparsed.value.shadows)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Single text-shadow round trip
   * Validates: Requirement 10.3 (text-shadow parsing)
   */
  it('should round-trip single text-shadow correctly', () => {
    fc.assert(
      fc.property(textShadowString, (shadow) => {
        const parsed = parser.parse(shadow);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(shadowArraysAreEquivalent(parsed.value.shadows, reparsed.value.shadows)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Multiple box-shadows round trip
   * Validates: Requirement 10.6 (round-trip property)
   */
  it('should round-trip multiple box-shadows correctly', () => {
    fc.assert(
      fc.property(multipleBoxShadows, (shadow) => {
        const parsed = parser.parse(shadow);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(shadowArraysAreEquivalent(parsed.value.shadows, reparsed.value.shadows)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Multiple text-shadows round trip
   * Validates: Requirement 10.6 (round-trip property)
   */
  it('should round-trip multiple text-shadows correctly', () => {
    fc.assert(
      fc.property(multipleTextShadows, (shadow) => {
        const parsed = parser.parse(shadow);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(shadowArraysAreEquivalent(parsed.value.shadows, reparsed.value.shadows)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Shadow normalization produces equal length arrays
   * Validates: Requirement 10.4 (shadow count normalization)
   */
  it('should normalize shadow arrays to equal length', () => {
    fc.assert(
      fc.property(
        fc.array(boxShadowString, { minLength: 1, maxLength: 5 }),
        fc.array(boxShadowString, { minLength: 1, maxLength: 5 }),
        (shadows1, shadows2) => {
          const parsed1 = parser.parse(shadows1.join(', '));
          const parsed2 = parser.parse(shadows2.join(', '));

          const [normalized1, normalized2] = normalizeShadowCounts(
            parsed1.value.shadows,
            parsed2.value.shadows,
          );

          expect(normalized1.length).toBe(normalized2.length);
          expect(normalized1.length).toBe(Math.max(shadows1.length, shadows2.length));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress 0 returns start shadow
   * Validates: Requirement 10.1 (interpolation)
   */
  it('should return start shadow at progress 0', () => {
    fc.assert(
      fc.property(boxShadowString, boxShadowString, (shadow1, shadow2) => {
        const parsed1 = parser.parse(shadow1);
        const parsed2 = parser.parse(shadow2);

        const result = parser.interpolate(parsed1.value, parsed2.value, 0);

        // At progress 0, we should get the first shadow (possibly with normalized length)
        const [normalizedFrom] = normalizeShadowCounts(
          parsed1.value.shadows,
          parsed2.value.shadows,
        );
        expect(shadowArraysAreEquivalent(result.shadows, normalizedFrom)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress 1 returns end shadow
   * Validates: Requirement 10.1 (interpolation)
   */
  it('should return end shadow at progress 1', () => {
    fc.assert(
      fc.property(boxShadowString, boxShadowString, (shadow1, shadow2) => {
        const parsed1 = parser.parse(shadow1);
        const parsed2 = parser.parse(shadow2);

        const result = parser.interpolate(parsed1.value, parsed2.value, 1);

        // At progress 1, we should get the second shadow (possibly with normalized length)
        const [, normalizedTo] = normalizeShadowCounts(
          parsed1.value.shadows,
          parsed2.value.shadows,
        );
        expect(shadowArraysAreEquivalent(result.shadows, normalizedTo)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Shadow detection is consistent
   * Validates: Requirement 10.6 (consistent detection)
   */
  it('should consistently detect valid shadows', () => {
    fc.assert(
      fc.property(fc.oneof(boxShadowString, textShadowString), (shadow) => {
        const detected1 = parser.detect(shadow);
        const detected2 = parser.detect(shadow);
        const detected3 = parser.detect(shadow);

        expect(detected1).toBe(true);
        expect(detected2).toBe(true);
        expect(detected3).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Inset keyword is preserved
   * Validates: Requirement 10.5 (inset preservation)
   */
  it('should preserve inset keyword during round trip', () => {
    fc.assert(
      fc.property(
        lengthValue,
        lengthValue,
        positiveLengthValue,
        lengthValue,
        colorString,
        (offsetX, offsetY, blur, spread, color) => {
          const insetShadow = `inset ${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`;
          const parsed = parser.parse(insetShadow);

          expect(parsed.value.shadows[0].inset).toBe(true);

          const serialized = parser.serialize(parsed);
          const reparsed = parser.parse(serialized);

          expect(reparsed.value.shadows[0].inset).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
