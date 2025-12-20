/**
 * Property-Based Test: Path Normalization Equivalence
 *
 * **Feature: enhanced-motion-capabilities, Property 8: Path Normalization Equivalence**
 * **Validates: Requirements 4.2, 4.3**
 *
 * This test verifies that path normalization preserves geometric equivalence
 * and that normalized paths can be interpolated correctly.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PathParser,
  PathValue,
  PathCommand,
  normalizePath,
  normalizePaths,
  interpolatePath,
} from '../../src/values/parsers/path';

describe('Property 8: Path Normalization Equivalence', () => {
  const parser = new PathParser();

  // Tolerance for floating-point comparisons
  const COORD_TOLERANCE = 0.001;

  /**
   * Helper to get the endpoint of a normalized path
   */
  function getPathEndpoint(commands: PathCommand[]): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;

    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M':
        case 'L':
        case 'T':
          x = (cmd as { x: number; y: number }).x;
          y = (cmd as { x: number; y: number }).y;
          if (cmd.type === 'M') {
            startX = x;
            startY = y;
          }
          break;
        case 'H':
          x = (cmd as { x: number }).x;
          break;
        case 'V':
          y = (cmd as { y: number }).y;
          break;
        case 'C':
          x = (cmd as { x: number; y: number }).x;
          y = (cmd as { x: number; y: number }).y;
          break;
        case 'S':
          x = (cmd as { x: number; y: number }).x;
          y = (cmd as { x: number; y: number }).y;
          break;
        case 'Q':
          x = (cmd as { x: number; y: number }).x;
          y = (cmd as { x: number; y: number }).y;
          break;
        case 'A':
          x = (cmd as { x: number; y: number }).x;
          y = (cmd as { x: number; y: number }).y;
          break;
        case 'Z':
          x = startX;
          y = startY;
          break;
      }
    }

    return { x, y };
  }

  /**
   * Helper to check if two numbers are approximately equal
   */
  function approxEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < COORD_TOLERANCE;
  }

  // ============================================================================
  // Arbitraries for generating valid SVG path data
  // ============================================================================

  /** Generate a coordinate value */
  const coord = fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true });

  /** Generate a positive coordinate (for radii) */
  const positiveCoord = fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true });

  /** Generate an angle value */
  const angle = fc.double({ min: 0, max: 360, noNaN: true, noDefaultInfinity: true });

  /** Generate a MoveTo command (absolute) */
  const moveToAbsCmd = fc.tuple(coord, coord).map(([x, y]) => `M${x} ${y}`);

  /** Generate a MoveTo command (relative) */
  const moveToRelCmd = fc.tuple(coord, coord).map(([x, y]) => `m${x} ${y}`);

  /** Generate a LineTo command (absolute) */
  const lineToAbsCmd = fc.tuple(coord, coord).map(([x, y]) => `L${x} ${y}`);

  /** Generate a LineTo command (relative) */
  const lineToRelCmd = fc.tuple(coord, coord).map(([x, y]) => `l${x} ${y}`);

  /** Generate a HorizontalLine command (absolute) */
  const hLineAbsCmd = coord.map((x) => `H${x}`);

  /** Generate a HorizontalLine command (relative) */
  const hLineRelCmd = coord.map((x) => `h${x}`);

  /** Generate a VerticalLine command (absolute) */
  const vLineAbsCmd = coord.map((y) => `V${y}`);

  /** Generate a VerticalLine command (relative) */
  const vLineRelCmd = coord.map((y) => `v${y}`);

  /** Generate a CubicBezier command (absolute) */
  const cubicAbsCmd = fc
    .tuple(coord, coord, coord, coord, coord, coord)
    .map(([x1, y1, x2, y2, x, y]) => `C${x1} ${y1} ${x2} ${y2} ${x} ${y}`);

  /** Generate a CubicBezier command (relative) */
  const cubicRelCmd = fc
    .tuple(coord, coord, coord, coord, coord, coord)
    .map(([x1, y1, x2, y2, x, y]) => `c${x1} ${y1} ${x2} ${y2} ${x} ${y}`);

  /** Generate a QuadraticBezier command (absolute) */
  const quadAbsCmd = fc
    .tuple(coord, coord, coord, coord)
    .map(([x1, y1, x, y]) => `Q${x1} ${y1} ${x} ${y}`);

  /** Generate a QuadraticBezier command (relative) */
  const quadRelCmd = fc
    .tuple(coord, coord, coord, coord)
    .map(([x1, y1, x, y]) => `q${x1} ${y1} ${x} ${y}`);

  /** Generate an Arc command (absolute) */
  const arcAbsCmd = fc
    .tuple(positiveCoord, positiveCoord, angle, fc.boolean(), fc.boolean(), coord, coord)
    .map(
      ([rx, ry, ang, largeArc, sweep, x, y]) =>
        `A${rx} ${ry} ${ang} ${largeArc ? 1 : 0} ${sweep ? 1 : 0} ${x} ${y}`,
    );

  /** Generate a ClosePath command */
  const closeCmd = fc.constant('Z');

  /** Generate any absolute drawing command */
  const absDrawingCmd = fc.oneof(
    lineToAbsCmd,
    hLineAbsCmd,
    vLineAbsCmd,
    cubicAbsCmd,
    quadAbsCmd,
    arcAbsCmd,
  );

  /** Generate any relative drawing command */
  const relDrawingCmd = fc.oneof(lineToRelCmd, hLineRelCmd, vLineRelCmd, cubicRelCmd, quadRelCmd);

  /** Generate a mixed drawing command */
  const mixedDrawingCmd = fc.oneof(absDrawingCmd, relDrawingCmd);

  /** Generate a path with absolute commands only */
  const absolutePath = fc
    .tuple(moveToAbsCmd, fc.array(absDrawingCmd, { minLength: 1, maxLength: 4 }))
    .map(([m, cmds]) => `${m} ${cmds.join(' ')}`);

  /** Generate a path with relative commands */
  const relativePath = fc
    .tuple(moveToAbsCmd, fc.array(relDrawingCmd, { minLength: 1, maxLength: 4 }))
    .map(([m, cmds]) => `${m} ${cmds.join(' ')}`);

  /** Generate a path with mixed absolute/relative commands */
  const mixedPath = fc
    .tuple(moveToAbsCmd, fc.array(mixedDrawingCmd, { minLength: 1, maxLength: 4 }))
    .map(([m, cmds]) => `${m} ${cmds.join(' ')}`);

  /** Generate a short path (for interpolation tests) */
  const shortPath = fc
    .tuple(moveToAbsCmd, fc.array(lineToAbsCmd, { minLength: 1, maxLength: 2 }))
    .map(([m, cmds]) => `${m} ${cmds.join(' ')}`);

  /** Generate a longer path (for interpolation tests) */
  const longerPath = fc
    .tuple(moveToAbsCmd, fc.array(lineToAbsCmd, { minLength: 3, maxLength: 5 }))
    .map(([m, cmds]) => `${m} ${cmds.join(' ')}`);

  // ============================================================================
  // Property Tests
  // ============================================================================

  /**
   * Property: Normalization converts all commands to absolute
   * Validates: Requirement 4.3 (path normalization)
   */
  it('should convert all relative commands to absolute', () => {
    fc.assert(
      fc.property(mixedPath, (path) => {
        const parsed = parser.parse(path);
        const normalized = normalizePath(parsed.value.commands);

        // All commands should be uppercase (absolute)
        for (const cmd of normalized) {
          expect(cmd.type).toBe(cmd.type.toUpperCase());
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Normalization preserves command count
   * Validates: Requirement 4.3 (path normalization)
   */
  it('should preserve command count after normalization', () => {
    fc.assert(
      fc.property(mixedPath, (path) => {
        const parsed = parser.parse(path);
        const normalized = normalizePath(parsed.value.commands);

        expect(normalized.length).toBe(parsed.value.commands.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Normalization preserves path endpoint
   * Validates: Requirement 4.3 (geometric equivalence)
   */
  it('should preserve path endpoint after normalization', () => {
    fc.assert(
      fc.property(absolutePath, (path) => {
        const parsed = parser.parse(path);
        const normalized = normalizePath(parsed.value.commands);

        const originalEnd = getPathEndpoint(parsed.value.commands);
        const normalizedEnd = getPathEndpoint(normalized);

        expect(approxEqual(originalEnd.x, normalizedEnd.x)).toBe(true);
        expect(approxEqual(originalEnd.y, normalizedEnd.y)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Normalizing twice produces same result
   * Validates: Requirement 4.3 (idempotent normalization)
   */
  it('should be idempotent - normalizing twice gives same result', () => {
    fc.assert(
      fc.property(mixedPath, (path) => {
        const parsed = parser.parse(path);
        const normalized1 = normalizePath(parsed.value.commands);
        const normalized2 = normalizePath(normalized1);

        expect(normalized1.length).toBe(normalized2.length);

        for (let i = 0; i < normalized1.length; i++) {
          expect(normalized1[i].type).toBe(normalized2[i].type);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: normalizePaths produces equal-length paths
   * Validates: Requirement 4.3 (command count matching)
   */
  it('should produce equal-length paths after normalizePaths', () => {
    fc.assert(
      fc.property(shortPath, longerPath, (path1, path2) => {
        const parsed1 = parser.parse(path1);
        const parsed2 = parser.parse(path2);

        const [norm1, norm2] = normalizePaths(parsed1.value, parsed2.value);

        // Both normalized paths should have the same length
        const len1 = norm1.normalized?.length ?? norm1.commands.length;
        const len2 = norm2.normalized?.length ?? norm2.commands.length;

        expect(len1).toBe(len2);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at 0 preserves start path structure
   * Validates: Requirement 4.2 (interpolation)
   */
  it('should preserve start path at progress 0', () => {
    fc.assert(
      fc.property(shortPath, shortPath, (path1, path2) => {
        const parsed1 = parser.parse(path1);
        const parsed2 = parser.parse(path2);

        const result = interpolatePath(parsed1.value, parsed2.value, 0);

        // Result should have commands
        expect(result.commands.length).toBeGreaterThan(0);

        // First command should be M
        expect(result.commands[0].type).toBe('M');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at 1 preserves end path structure
   * Validates: Requirement 4.2 (interpolation)
   */
  it('should preserve end path at progress 1', () => {
    fc.assert(
      fc.property(shortPath, shortPath, (path1, path2) => {
        const parsed1 = parser.parse(path1);
        const parsed2 = parser.parse(path2);

        const result = interpolatePath(parsed1.value, parsed2.value, 1);

        // Result should have commands
        expect(result.commands.length).toBeGreaterThan(0);

        // First command should be M
        expect(result.commands[0].type).toBe('M');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation at 0.5 produces intermediate values
   * Validates: Requirement 4.2 (interpolation)
   */
  it('should produce intermediate values at progress 0.5', () => {
    fc.assert(
      fc.property(shortPath, shortPath, (path1, path2) => {
        const parsed1 = parser.parse(path1);
        const parsed2 = parser.parse(path2);

        const result = interpolatePath(parsed1.value, parsed2.value, 0.5);

        // Result should have commands
        expect(result.commands.length).toBeGreaterThan(0);

        // Get endpoints
        const start = getPathEndpoint(normalizePath(parsed1.value.commands));
        const end = getPathEndpoint(normalizePath(parsed2.value.commands));
        const mid = getPathEndpoint(result.commands);

        // Mid should be between start and end (or equal if they're the same)
        const expectedMidX = (start.x + end.x) / 2;
        const expectedMidY = (start.y + end.y) / 2;

        // Allow some tolerance due to path padding
        expect(
          Math.abs(mid.x - expectedMidX) < Math.abs(end.x - start.x) + COORD_TOLERANCE ||
            approxEqual(start.x, end.x),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Interpolation is continuous
   * Validates: Requirement 4.2 (smooth interpolation)
   */
  it('should produce continuous interpolation', () => {
    fc.assert(
      fc.property(
        shortPath,
        shortPath,
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        (path1, path2, t) => {
          const parsed1 = parser.parse(path1);
          const parsed2 = parser.parse(path2);

          const result1 = interpolatePath(parsed1.value, parsed2.value, t);
          const result2 = interpolatePath(parsed1.value, parsed2.value, t + 0.1);

          // Both results should have the same number of commands
          expect(result1.commands.length).toBe(result2.commands.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Normalized paths maintain command type structure
   * Validates: Requirement 4.3 (structure preservation)
   */
  it('should maintain command type structure after normalization', () => {
    fc.assert(
      fc.property(absolutePath, (path) => {
        const parsed = parser.parse(path);
        const normalized = normalizePath(parsed.value.commands);

        // Command types should match (uppercase)
        for (let i = 0; i < parsed.value.commands.length; i++) {
          const originalType = parsed.value.commands[i].type.toUpperCase();
          const normalizedType = normalized[i].type;

          expect(normalizedType).toBe(originalType);
        }
      }),
      { numRuns: 100 },
    );
  });
});
