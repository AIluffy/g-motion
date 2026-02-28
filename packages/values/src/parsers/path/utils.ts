/**
 * Path Parsing Utilities
 *
 * Helper functions for parsing SVG path data strings.
 *
 * @module values/parsers/path/utils
 */

import type { PathCommand } from './types';

/** Regex to match path commands and their parameters */
const PATH_COMMAND_REGEX = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;

/** Regex to extract numbers from parameter string */
const NUMBER_REGEX = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/** Regex to detect if a string is an SVG path */
export const PATH_DETECT_REGEX = /^\s*[Mm]\s*[-\d.,\s]+/;

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
