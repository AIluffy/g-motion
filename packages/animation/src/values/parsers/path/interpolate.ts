/**
 * Path Interpolation
 *
 * Functions for interpolating between path values for smooth animations.
 *
 * @module values/parsers/path/interpolate
 */

import type {
  PathCommand,
  PathValue,
  MoveToCommand,
  LineToCommand,
  SmoothQuadraticCommand,
  HorizontalLineCommand,
  VerticalLineCommand,
  CubicBezierCommand,
  SmoothCubicCommand,
  QuadraticBezierCommand,
  ArcCommand,
} from './types';
import { normalizePath, normalizePaths } from './normalize';

/**
 * Interpolate a single number
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two path commands of the same type
 */
function interpolateCommand(from: PathCommand, to: PathCommand, progress: number): PathCommand {
  // If types don't match, just return the target at the end
  if (from.type !== to.type) {
    return progress < 1 ? from : to;
  }

  switch (from.type) {
    case 'M':
    case 'L':
    case 'T':
      return {
        type: from.type,
        x: lerp((from as MoveToCommand).x, (to as MoveToCommand).x, progress),
        y: lerp((from as MoveToCommand).y, (to as MoveToCommand).y, progress),
      } as MoveToCommand | LineToCommand | SmoothQuadraticCommand;

    case 'H':
      return {
        type: 'H',
        x: lerp((from as HorizontalLineCommand).x, (to as HorizontalLineCommand).x, progress),
      };

    case 'V':
      return {
        type: 'V',
        y: lerp((from as VerticalLineCommand).y, (to as VerticalLineCommand).y, progress),
      };

    case 'C': {
      const f = from as CubicBezierCommand;
      const t = to as CubicBezierCommand;
      return {
        type: 'C',
        x1: lerp(f.x1, t.x1, progress),
        y1: lerp(f.y1, t.y1, progress),
        x2: lerp(f.x2, t.x2, progress),
        y2: lerp(f.y2, t.y2, progress),
        x: lerp(f.x, t.x, progress),
        y: lerp(f.y, t.y, progress),
      };
    }

    case 'S': {
      const f = from as SmoothCubicCommand;
      const t = to as SmoothCubicCommand;
      return {
        type: 'S',
        x2: lerp(f.x2, t.x2, progress),
        y2: lerp(f.y2, t.y2, progress),
        x: lerp(f.x, t.x, progress),
        y: lerp(f.y, t.y, progress),
      };
    }

    case 'Q': {
      const f = from as QuadraticBezierCommand;
      const t = to as QuadraticBezierCommand;
      return {
        type: 'Q',
        x1: lerp(f.x1, t.x1, progress),
        y1: lerp(f.y1, t.y1, progress),
        x: lerp(f.x, t.x, progress),
        y: lerp(f.y, t.y, progress),
      };
    }

    case 'A': {
      const f = from as ArcCommand;
      const t = to as ArcCommand;
      return {
        type: 'A',
        rx: lerp(f.rx, t.rx, progress),
        ry: lerp(f.ry, t.ry, progress),
        angle: lerp(f.angle, t.angle, progress),
        largeArc: progress < 0.5 ? f.largeArc : t.largeArc,
        sweep: progress < 0.5 ? f.sweep : t.sweep,
        x: lerp(f.x, t.x, progress),
        y: lerp(f.y, t.y, progress),
      };
    }

    case 'Z':
      return { type: 'Z' };

    default:
      return from;
  }
}

/**
 * Interpolate between two path values
 */
export function interpolatePath(from: PathValue, to: PathValue, progress: number): PathValue {
  // Use normalized commands if available
  const fromCmds = from.normalized || normalizePath(from.commands);
  const toCmds = to.normalized || normalizePath(to.commands);

  // If lengths don't match, normalize them
  if (fromCmds.length !== toCmds.length) {
    const [normFrom, normTo] = normalizePaths(from, to);
    return interpolatePath(normFrom, normTo, progress);
  }

  const interpolated: PathCommand[] = [];
  for (let i = 0; i < fromCmds.length; i++) {
    interpolated.push(interpolateCommand(fromCmds[i], toCmds[i], progress));
  }

  return { commands: interpolated };
}
