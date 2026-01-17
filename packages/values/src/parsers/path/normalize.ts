/**
 * Path Normalization
 *
 * Functions for normalizing path commands to absolute coordinates
 * and preparing paths for interpolation.
 *
 * @module values/parsers/path/normalize
 */

import type {
  PathCommand,
  PathValue,
  MoveToCommand,
  LineToCommand,
  HorizontalLineCommand,
  VerticalLineCommand,
  CubicBezierCommand,
  SmoothCubicCommand,
  QuadraticBezierCommand,
  SmoothQuadraticCommand,
  ArcCommand,
} from './types';

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

/**
 * Normalize two paths to have matching command structures for interpolation
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
