/**
 * Path Types and Interfaces
 *
 * Type definitions for SVG path commands and values.
 *
 * @module values/parsers/path/types
 */

/**
 * Move to command (M/m)
 */
export interface MoveToCommand {
  type: 'M' | 'm';
  x: number;
  y: number;
}

/**
 * Line to command (L/l)
 */
export interface LineToCommand {
  type: 'L' | 'l';
  x: number;
  y: number;
}

/**
 * Horizontal line command (H/h)
 */
export interface HorizontalLineCommand {
  type: 'H' | 'h';
  x: number;
}

/**
 * Vertical line command (V/v)
 */
export interface VerticalLineCommand {
  type: 'V' | 'v';
  y: number;
}

/**
 * Cubic bezier curve command (C/c)
 */
export interface CubicBezierCommand {
  type: 'C' | 'c';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
}

/**
 * Smooth cubic bezier command (S/s)
 */
export interface SmoothCubicCommand {
  type: 'S' | 's';
  x2: number;
  y2: number;
  x: number;
  y: number;
}

/**
 * Quadratic bezier curve command (Q/q)
 */
export interface QuadraticBezierCommand {
  type: 'Q' | 'q';
  x1: number;
  y1: number;
  x: number;
  y: number;
}

/**
 * Smooth quadratic bezier command (T/t)
 */
export interface SmoothQuadraticCommand {
  type: 'T' | 't';
  x: number;
  y: number;
}

/**
 * Arc command (A/a)
 */
export interface ArcCommand {
  type: 'A' | 'a';
  rx: number;
  ry: number;
  angle: number;
  largeArc: boolean;
  sweep: boolean;
  x: number;
  y: number;
}

/**
 * Close path command (Z/z)
 */
export interface ClosePathCommand {
  type: 'Z' | 'z';
}

/**
 * Union type for all path commands
 */
export type PathCommand =
  | MoveToCommand
  | LineToCommand
  | HorizontalLineCommand
  | VerticalLineCommand
  | CubicBezierCommand
  | SmoothCubicCommand
  | QuadraticBezierCommand
  | SmoothQuadraticCommand
  | ArcCommand
  | ClosePathCommand;

/**
 * Parsed SVG path value
 */
export interface PathValue {
  /** Original parsed commands */
  commands: PathCommand[];
  /** Normalized commands for interpolation (all absolute) */
  normalized?: PathCommand[];
}
