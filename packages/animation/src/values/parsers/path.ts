/**
 * SVG Path Value Parser
 *
 * Handles parsing and interpolation of SVG path data strings.
 * Supports all standard SVG path commands: M, L, H, V, C, S, Q, T, A, Z
 *
 * @module values/parsers/path
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../types';

// ============================================================================
// Path Command Types
// ============================================================================

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

// ============================================================================
// Path Parsing
// ============================================================================

/** Regex to match path commands and their parameters */
const PATH_COMMAND_REGEX = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;

/** Regex to extract numbers from parameter string */
const NUMBER_REGEX = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/** Regex to detect if a string is an SVG path */
const PATH_DETECT_REGEX = /^\s*[Mm]\s*[-\d.,\s]+/;

/**
 * Parse numbers from a parameter string
 */
function parseNumbers(str: string): number[] {
  const matches = str.match(NUMBER_REGEX);
  return matches ? matches.map(Number) : [];
}

/**
 * Parse a single path command with its parameters
 */
function parseCommand(type: string, params: number[]): PathCommand[] {
  const commands: PathCommand[] = [];
  const cmdType = type as PathCommand['type'];

  switch (type.toUpperCase()) {
    case 'M': {
      // MoveTo: first pair is moveto, subsequent pairs are implicit lineto
      for (let i = 0; i < params.length; i += 2) {
        if (i === 0) {
          commands.push({
            type: cmdType as 'M' | 'm',
            x: params[i],
            y: params[i + 1],
          });
        } else {
          // Implicit lineto after first moveto
          commands.push({
            type: (type === 'M' ? 'L' : 'l') as 'L' | 'l',
            x: params[i],
            y: params[i + 1],
          });
        }
      }
      break;
    }

    case 'L': {
      for (let i = 0; i < params.length; i += 2) {
        commands.push({
          type: cmdType as 'L' | 'l',
          x: params[i],
          y: params[i + 1],
        });
      }
      break;
    }

    case 'H': {
      for (const x of params) {
        commands.push({
          type: cmdType as 'H' | 'h',
          x,
        });
      }
      break;
    }

    case 'V': {
      for (const y of params) {
        commands.push({
          type: cmdType as 'V' | 'v',
          y,
        });
      }
      break;
    }

    case 'C': {
      for (let i = 0; i < params.length; i += 6) {
        commands.push({
          type: cmdType as 'C' | 'c',
          x1: params[i],
          y1: params[i + 1],
          x2: params[i + 2],
          y2: params[i + 3],
          x: params[i + 4],
          y: params[i + 5],
        });
      }
      break;
    }

    case 'S': {
      for (let i = 0; i < params.length; i += 4) {
        commands.push({
          type: cmdType as 'S' | 's',
          x2: params[i],
          y2: params[i + 1],
          x: params[i + 2],
          y: params[i + 3],
        });
      }
      break;
    }

    case 'Q': {
      for (let i = 0; i < params.length; i += 4) {
        commands.push({
          type: cmdType as 'Q' | 'q',
          x1: params[i],
          y1: params[i + 1],
          x: params[i + 2],
          y: params[i + 3],
        });
      }
      break;
    }

    case 'T': {
      for (let i = 0; i < params.length; i += 2) {
        commands.push({
          type: cmdType as 'T' | 't',
          x: params[i],
          y: params[i + 1],
        });
      }
      break;
    }

    case 'A': {
      for (let i = 0; i < params.length; i += 7) {
        commands.push({
          type: cmdType as 'A' | 'a',
          rx: params[i],
          ry: params[i + 1],
          angle: params[i + 2],
          largeArc: params[i + 3] !== 0,
          sweep: params[i + 4] !== 0,
          x: params[i + 5],
          y: params[i + 6],
        });
      }
      break;
    }

    case 'Z': {
      commands.push({ type: cmdType as 'Z' | 'z' });
      break;
    }
  }

  return commands;
}

/**
 * Parse an SVG path data string into commands
 */
export function parsePath(pathData: string): PathCommand[] {
  const commands: PathCommand[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  PATH_COMMAND_REGEX.lastIndex = 0;

  while ((match = PATH_COMMAND_REGEX.exec(pathData)) !== null) {
    const [, type, paramStr] = match;
    const params = parseNumbers(paramStr);
    const parsed = parseCommand(type, params);
    commands.push(...parsed);
  }

  return commands;
}

// ============================================================================
// Path Normalization (Relative to Absolute)
// ============================================================================

/**
 * Convert a relative command to absolute coordinates
 */
export function commandToAbsolute(
  cmd: PathCommand,
  currentX: number,
  currentY: number,
): PathCommand {
  const type = cmd.type;
  const isRelative = type === type.toLowerCase();

  if (!isRelative) {
    return cmd;
  }

  switch (type) {
    case 'm':
      return {
        type: 'M',
        x: currentX + (cmd as MoveToCommand).x,
        y: currentY + (cmd as MoveToCommand).y,
      };

    case 'l':
      return {
        type: 'L',
        x: currentX + (cmd as LineToCommand).x,
        y: currentY + (cmd as LineToCommand).y,
      };

    case 'h':
      return {
        type: 'H',
        x: currentX + (cmd as HorizontalLineCommand).x,
      };

    case 'v':
      return {
        type: 'V',
        y: currentY + (cmd as VerticalLineCommand).y,
      };

    case 'c': {
      const c = cmd as CubicBezierCommand;
      return {
        type: 'C',
        x1: currentX + c.x1,
        y1: currentY + c.y1,
        x2: currentX + c.x2,
        y2: currentY + c.y2,
        x: currentX + c.x,
        y: currentY + c.y,
      };
    }

    case 's': {
      const s = cmd as SmoothCubicCommand;
      return {
        type: 'S',
        x2: currentX + s.x2,
        y2: currentY + s.y2,
        x: currentX + s.x,
        y: currentY + s.y,
      };
    }

    case 'q': {
      const q = cmd as QuadraticBezierCommand;
      return {
        type: 'Q',
        x1: currentX + q.x1,
        y1: currentY + q.y1,
        x: currentX + q.x,
        y: currentY + q.y,
      };
    }

    case 't': {
      const t = cmd as SmoothQuadraticCommand;
      return {
        type: 'T',
        x: currentX + t.x,
        y: currentY + t.y,
      };
    }

    case 'a': {
      const a = cmd as ArcCommand;
      return {
        type: 'A',
        rx: a.rx,
        ry: a.ry,
        angle: a.angle,
        largeArc: a.largeArc,
        sweep: a.sweep,
        x: currentX + a.x,
        y: currentY + a.y,
      };
    }

    case 'z':
      return { type: 'Z' };

    default:
      return cmd;
  }
}

/**
 * Get the end point of a command
 */
function getCommandEndPoint(
  cmd: PathCommand,
  currentX: number,
  currentY: number,
  startX: number,
  startY: number,
): [number, number] {
  switch (cmd.type.toUpperCase()) {
    case 'M':
    case 'L':
    case 'T':
      return [
        (cmd as MoveToCommand | LineToCommand | SmoothQuadraticCommand).x,
        (cmd as MoveToCommand | LineToCommand | SmoothQuadraticCommand).y,
      ];

    case 'H':
      return [(cmd as HorizontalLineCommand).x, currentY];

    case 'V':
      return [currentX, (cmd as VerticalLineCommand).y];

    case 'C':
      return [(cmd as CubicBezierCommand).x, (cmd as CubicBezierCommand).y];

    case 'S':
      return [(cmd as SmoothCubicCommand).x, (cmd as SmoothCubicCommand).y];

    case 'Q':
      return [(cmd as QuadraticBezierCommand).x, (cmd as QuadraticBezierCommand).y];

    case 'A':
      return [(cmd as ArcCommand).x, (cmd as ArcCommand).y];

    case 'Z':
      return [startX, startY];

    default:
      return [currentX, currentY];
  }
}

/**
 * Normalize path commands to absolute coordinates
 */
export function normalizePath(commands: PathCommand[]): PathCommand[] {
  const normalized: PathCommand[] = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of commands) {
    const absoluteCmd = commandToAbsolute(cmd, currentX, currentY);
    normalized.push(absoluteCmd);

    // Update current position
    const [newX, newY] = getCommandEndPoint(absoluteCmd, currentX, currentY, startX, startY);
    currentX = newX;
    currentY = newY;

    // Track subpath start for Z command
    if (absoluteCmd.type === 'M') {
      startX = currentX;
      startY = currentY;
    }
  }

  return normalized;
}

// ============================================================================
// Path Normalization for Interpolation (Command Matching)
// ============================================================================

/**
 * Convert H/V commands to L commands for easier interpolation
 */
function expandShorthandCommands(commands: PathCommand[]): PathCommand[] {
  const expanded: PathCommand[] = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'H':
        expanded.push({ type: 'L', x: cmd.x, y: currentY });
        currentX = cmd.x;
        break;

      case 'V':
        expanded.push({ type: 'L', x: currentX, y: cmd.y });
        currentY = cmd.y;
        break;

      case 'M':
        expanded.push(cmd);
        currentX = cmd.x;
        currentY = cmd.y;
        startX = currentX;
        startY = currentY;
        break;

      case 'Z':
        expanded.push(cmd);
        currentX = startX;
        currentY = startY;
        break;

      default:
        expanded.push(cmd);
        const [newX, newY] = getCommandEndPoint(cmd, currentX, currentY, startX, startY);
        currentX = newX;
        currentY = newY;
    }
  }

  return expanded;
}

/**
 * Normalize two paths to have matching command structures for interpolation
 * This adds intermediate points to make paths compatible
 */
export function normalizePaths(from: PathValue, to: PathValue): [PathValue, PathValue] {
  // First normalize both to absolute coordinates
  const fromNorm = normalizePath(from.commands);
  const toNorm = normalizePath(to.commands);

  // Expand shorthand commands
  const fromExpanded = expandShorthandCommands(fromNorm);
  const toExpanded = expandShorthandCommands(toNorm);

  // If command counts match, return as-is
  if (fromExpanded.length === toExpanded.length) {
    return [
      { commands: from.commands, normalized: fromExpanded },
      { commands: to.commands, normalized: toExpanded },
    ];
  }

  // Add dummy commands to shorter path
  const maxLen = Math.max(fromExpanded.length, toExpanded.length);
  const fromPadded = padCommands(fromExpanded, maxLen);
  const toPadded = padCommands(toExpanded, maxLen);

  return [
    { commands: from.commands, normalized: fromPadded },
    { commands: to.commands, normalized: toPadded },
  ];
}

/**
 * Pad commands array to target length by duplicating last point
 */
function padCommands(commands: PathCommand[], targetLength: number): PathCommand[] {
  if (commands.length >= targetLength) {
    return commands;
  }

  const result = [...commands];
  let lastX = 0;
  let lastY = 0;

  // Find last position
  for (const cmd of commands) {
    if ('x' in cmd) lastX = cmd.x;
    if ('y' in cmd) lastY = cmd.y;
  }

  // Add L commands to reach target length
  while (result.length < targetLength) {
    result.push({ type: 'L', x: lastX, y: lastY });
  }

  return result;
}

// ============================================================================
// Path Serialization
// ============================================================================

/**
 * Serialize a path command to string
 */
function serializeCommand(cmd: PathCommand): string {
  switch (cmd.type) {
    case 'M':
    case 'm':
    case 'L':
    case 'l':
    case 'T':
    case 't':
      return `${cmd.type}${(cmd as MoveToCommand).x} ${(cmd as MoveToCommand).y}`;

    case 'H':
    case 'h':
      return `${cmd.type}${(cmd as HorizontalLineCommand).x}`;

    case 'V':
    case 'v':
      return `${cmd.type}${(cmd as VerticalLineCommand).y}`;

    case 'C':
    case 'c': {
      const c = cmd as CubicBezierCommand;
      return `${cmd.type}${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`;
    }

    case 'S':
    case 's': {
      const s = cmd as SmoothCubicCommand;
      return `${cmd.type}${s.x2} ${s.y2} ${s.x} ${s.y}`;
    }

    case 'Q':
    case 'q': {
      const q = cmd as QuadraticBezierCommand;
      return `${cmd.type}${q.x1} ${q.y1} ${q.x} ${q.y}`;
    }

    case 'A':
    case 'a': {
      const a = cmd as ArcCommand;
      return `${cmd.type}${a.rx} ${a.ry} ${a.angle} ${a.largeArc ? 1 : 0} ${a.sweep ? 1 : 0} ${a.x} ${a.y}`;
    }

    case 'Z':
    case 'z':
      return cmd.type;

    default:
      return '';
  }
}

/**
 * Serialize path commands to SVG path data string
 */
export function serializePath(commands: PathCommand[]): string {
  return commands.map(serializeCommand).join(' ');
}

// ============================================================================
// Path Interpolation
// ============================================================================

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

// ============================================================================
// Path Parser Class
// ============================================================================

/**
 * Parser for SVG path data values
 *
 * Supports all standard SVG path commands and provides
 * interpolation for path morphing animations.
 */
export class PathParser implements ValueParser<PathValue> {
  readonly type = ValueType.Path;

  /**
   * Detect if a value is an SVG path
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();
    return PATH_DETECT_REGEX.test(trimmed);
  }

  /**
   * Parse an SVG path data string
   */
  parse(value: unknown): ParsedValue<PathValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Path, 'Value must be a string');
    }

    const trimmed = value.trim();

    try {
      const commands = parsePath(trimmed);

      if (commands.length === 0) {
        throw new Error('No valid path commands found');
      }

      return {
        type: ValueType.Path,
        value: { commands },
        original: value,
      };
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Path,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }
  }

  /**
   * Serialize a path value back to SVG path data string
   */
  serialize(parsed: ParsedValue<PathValue>): string {
    return serializePath(parsed.value.commands);
  }

  /**
   * Interpolate between two path values
   */
  interpolate(from: PathValue, to: PathValue, progress: number): PathValue {
    return interpolatePath(from, to, progress);
  }
}

/**
 * Default path parser instance
 */
export const pathParser = new PathParser();
