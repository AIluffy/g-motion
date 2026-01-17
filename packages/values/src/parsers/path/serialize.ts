/**
 * Path Serialization
 *
 * Functions for serializing path commands back to SVG path data strings.
 *
 * @module values/parsers/path/serialize
 */

import type {
  PathCommand,
  MoveToCommand,
  HorizontalLineCommand,
  VerticalLineCommand,
  CubicBezierCommand,
  SmoothCubicCommand,
  QuadraticBezierCommand,
  ArcCommand,
} from './types';

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
