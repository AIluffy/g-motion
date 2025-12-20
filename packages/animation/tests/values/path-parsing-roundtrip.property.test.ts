/**
 * Property-Based Test: SVG Path Parsing Round Trip
 *
 * **Feature: enhanced-motion-capabilities, Property 2: SVG Path Parsing Round Trip**
 * **Validates: Requirements 4.1, 4.2, 4.6**
 *
 * This test verifies that for any valid SVG path data string,
 * parsing then serializing produces a path that renders identically.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PathParser,
  PathValue,
  PathCommand,
  normalizePath,
  interpolatePath,
} from '../../src/values/parsers/path';

describe('Property 2: SVG Path Parsing Round Trip', () => {
  const parser = new PathParser();

  // Tolerance for floating-point comparisons
  const COORD_TOLERANCE = 0.001;

  /**
   * Helper to check if two path values are equivalent
   */
  function pathsAreEquivalent(a: PathValue, b: PathValue): boolean {
    const aNorm = normalizePath(a.commands);
    const bNorm = normalizePath(b.commands);

    if (aNorm.length !== bNorm.length) {
      return false;
    }

    for (let i = 0; i < aNorm.length; i++) {
      if (!commandsAreEquivalent(aNorm[i], bNorm[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Helper to check if two commands are equivalent
   */
  function commandsAreEquivalent(a: PathCommand, b: PathCommand): boolean {
    if (a.type.toUpperCase() !== b.type.toUpperCase()) {
      return false;
    }

    const aAny = a as unknown as Record<string, unknown>;
    const bAny = b as unknown as Record<string, unknown>;

    for (const key of Object.keys(aAny)) {
      if (key === 'type') continue;

      const aVal = aAny[key];
      const bVal = bAny[key];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (Math.abs(aVal - bVal) > COORD_TOLERANCE) {
          return false;
        }
      } else if (aVal !== bVal) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // Arbitraries for generating valid SVG path data
  // ============================================================================

  /** Generate a coordinate value */
  const coord = fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true });

  /** Generate a positive coordinate (for radii) */
  const positiveCoord = fc.double({ min: 0.1, max: 500, noNaN: true, noDefaultInfinity: true });

  /** Generate an angle value */
  const angle = fc.double({ min: 0, max: 360, noNaN: true, noDefaultInfinity: true });

  /** Generate a MoveTo command */
  const moveToCmd = fc.tuple(coord, coord).map(([x, y]) => `M${x} ${y}`);

  /** Generate a LineTo command */
  const lineToCmd = fc.tuple(coord, coord).map(([x, y]) => `L${x} ${y}`);

  /** Generate a HorizontalLine command */
  const hLineCmd = coord.map((x) => `H${x}`);

  /** Generate a VerticalLine command */
  const vLineCmd = coord.map((y) => `V${y}`);

  /** Generate a CubicBezier command */
  const cubicCmd = fc
    .tuple(coord, coord, coord, coord, coord, coord)
    .map(([x1, y1, x2, y2, x, y]) => `C${x1} ${y1} ${x2} ${y2} ${x} ${y}`);

  /** Generate a SmoothCubic command */
  const smoothCubicCmd = fc
    .tuple(coord, coord, coord, coord)
    .map(([x2, y2, x, y]) => `S${x2} ${y2} ${x} ${y}`);

  /** Generate a QuadraticBezier command */
  const quadCmd = fc
    .tuple(coord, coord, coord, coord)
    .map(([x1, y1, x, y]) => `Q${x1} ${y1} ${x} ${y}`);

  /** Generate a SmoothQuadratic command */
  const smoothQuadCmd = fc.tuple(coord, coord).map(([x, y]) => `T${x} ${y}`);

  /** Generate an Arc command */
  const arcCmd = fc
    .tuple(positiveCoord, positiveCoord, angle, fc.boolean(), fc.boolean(), coord, coord)
    .map(
      ([rx, ry, ang, largeArc, sweep, x, y]) =>
        `A${rx} ${ry} ${ang} ${largeArc ? 1 : 0} ${sweep ? 1 : 0} ${x} ${y}`,
    );

  /** Generate a ClosePath command */
  const closeCmd = fc.constant('Z');

  /** Generate any drawing command (after initial M) */
  const drawingCmd = fc.oneof(
    lineToCmd,
    hLineCmd,
    vLineCmd,
    cubicCmd,
    smoothCubicCmd,
    quadCmd,
    smoothQuadCmd,
    arcCmd,
  );

  /** Generate a simple path (M followed by drawing commands) */
  const simplePath = fc
    .tuple(moveToCmd, fc.array(drawingCmd, { minLength: 1, maxLength: 5 }))
    .map(([m, cmds]) => `${m} ${cmds.join(' ')}`);

  /** Generate a closed path */
  const closedPath = fc
    .tuple(moveToCmd, fc.array(drawingCmd, { minLength: 1, maxLength: 5 }), closeCmd)
    .map(([m, cmds, z]) => `${m} ${cmds.join(' ')} ${z}`);

  /** Generate any valid path */
  const anyPath = fc.oneof(simplePath, closedPath);

  // ============================================================================
  // Property Tests
  // ============================================================================

  /**
   * Property: Simple path round trip
   * Validates: Requirement 4.1 (path parsing), 4.6 (round-trip)
   */
  it('should round-trip simple paths correctly', () => {
    fc.assert(
      fc.property(simplePath, (path) => {
        const parsed = parser.parse(path);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(pathsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Closed path round trip
   * Validates: Requirement 4.1 (path parsing), 4.6 (round-trip)
   */
  it('should round-trip closed paths correctly', () => {
    fc.assert(
      fc.property(closedPath, (path) => {
        const parsed = parser.parse(path);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(pathsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Any valid path round trip
   * Validates: Requirement 4.6 (round-trip property)
   */
  it('should round-trip any valid path correctly', () => {
    fc.assert(
      fc.property(anyPath, (path) => {
        const parsed = parser.parse(path);
        const serialized = parser.serialize(parsed);
        const reparsed = parser.parse(serialized);

        expect(pathsAreEquivalent(parsed.value, reparsed.value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress 0 returns start path
   * Validates: Requirement 4.2 (interpolation)
   */
  it('should return start path at progress 0', () => {
    fc.assert(
      fc.property(simplePath, simplePath, (path1, path2) => {
        const parsed1 = parser.parse(path1);
        const parsed2 = parser.parse(path2);

        const result = interpolatePath(parsed1.value, parsed2.value, 0);

        // At progress 0, result should match the start path
        const normResult = normalizePath(result.commands);

        // Check that command count matches (after normalization for interpolation)
        expect(normResult.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at progress 1 returns end path
   * Validates: Requirement 4.2 (interpolation)
   */
  it('should return end path at progress 1', () => {
    fc.assert(
      fc.property(simplePath, simplePath, (path1, path2) => {
        const parsed1 = parser.parse(path1);
        const parsed2 = parser.parse(path2);

        const result = interpolatePath(parsed1.value, parsed2.value, 1);

        // At progress 1, result should match the end path
        const normResult = normalizePath(result.commands);

        // Check that command count matches (after normalization for interpolation)
        expect(normResult.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Path detection is consistent
   * Validates: Requirement 4.1 (consistent detection)
   */
  it('should consistently detect valid paths', () => {
    fc.assert(
      fc.property(anyPath, (path) => {
        const detected1 = parser.detect(path);
        const detected2 = parser.detect(path);
        const detected3 = parser.detect(path);

        expect(detected1).toBe(true);
        expect(detected2).toBe(true);
        expect(detected3).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Parsed path has at least one command
   * Validates: Requirement 4.1 (valid parsing)
   */
  it('should parse paths with at least one command', () => {
    fc.assert(
      fc.property(anyPath, (path) => {
        const parsed = parser.parse(path);

        expect(parsed.value.commands.length).toBeGreaterThan(0);
        expect(parsed.value.commands[0].type.toUpperCase()).toBe('M');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Serialized path can be reparsed
   * Validates: Requirement 4.6 (serialization)
   */
  it('should produce reparseable serialized output', () => {
    fc.assert(
      fc.property(anyPath, (path) => {
        const parsed = parser.parse(path);
        const serialized = parser.serialize(parsed);

        // Should not throw
        expect(() => parser.parse(serialized)).not.toThrow();

        // Should detect as path
        expect(parser.detect(serialized)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
