/**
 * Gradient Parsing Utilities
 *
 * Helper functions for parsing CSS gradient strings.
 *
 * @module values/parsers/gradient/utils
 */

import { ColorParser } from '../color';
import type { GradientStop, GradientValue, RadialShape, RadialSize } from './types';

// Color parser instance for parsing color stops
const colorParser = new ColorParser();

/** Pattern to detect gradient functions */
export const GRADIENT_PATTERN = /^(repeating-)?(linear|radial|conic)-gradient\s*\(/i;

/** Pattern to extract angle from linear gradient */
const LINEAR_ANGLE_PATTERN =
  /^(\d+(?:\.\d+)?)(deg|rad|turn|grad)?|to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?/i;

/** Pattern to extract radial shape and size */
const RADIAL_SHAPE_PATTERN =
  /^(circle|ellipse)?(?:\s+(closest-side|closest-corner|farthest-side|farthest-corner))?/i;

/** Pattern to extract position */
const POSITION_PATTERN = /at\s+([\w%.-]+)(?:\s+([\w%.-]+))?/i;

/** Pattern to extract conic from angle */
const CONIC_FROM_PATTERN = /from\s+(\d+(?:\.\d+)?)(deg|rad|turn|grad)?/i;

/**
 * Convert angle unit to degrees
 */
function angleToDegreees(value: number, unit?: string): number {
  if (!unit || unit === 'deg') return value;
  if (unit === 'rad') return (value * 180) / Math.PI;
  if (unit === 'turn') return value * 360;
  if (unit === 'grad') return value * 0.9;
  return value;
}

/**
 * Parse direction keyword to angle
 */
function directionToAngle(dir1: string, dir2?: string): number {
  const directions: Record<string, number> = {
    top: 0,
    right: 90,
    bottom: 180,
    left: 270,
  };

  if (!dir2) {
    return directions[dir1.toLowerCase()] ?? 180;
  }

  // Combined directions (e.g., "to top right")
  const d1 = dir1.toLowerCase();
  const d2 = dir2.toLowerCase();

  if ((d1 === 'top' && d2 === 'right') || (d1 === 'right' && d2 === 'top')) return 45;
  if ((d1 === 'top' && d2 === 'left') || (d1 === 'left' && d2 === 'top')) return 315;
  if ((d1 === 'bottom' && d2 === 'right') || (d1 === 'right' && d2 === 'bottom')) return 135;
  if ((d1 === 'bottom' && d2 === 'left') || (d1 === 'left' && d2 === 'bottom')) return 225;

  return 180;
}

/**
 * Parse a position value (percentage, pixel, or keyword)
 */
function parsePositionValue(value: string): number | string {
  const trimmed = value.trim().toLowerCase();

  // Keywords
  if (trimmed === 'center') return '50%';
  if (trimmed === 'left' || trimmed === 'top') return '0%';
  if (trimmed === 'right' || trimmed === 'bottom') return '100%';

  // Percentage
  if (trimmed.endsWith('%')) {
    return parseFloat(trimmed);
  }

  // Pixel or other unit
  return trimmed;
}

/**
 * Split gradient arguments respecting nested parentheses
 */
export function splitGradientArgs(content: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of content) {
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

/**
 * Parse a color stop from a string
 */
export function parseColorStop(stopStr: string): GradientStop {
  const trimmed = stopStr.trim();

  // Try to find position at the end (e.g., "red 50%" or "#ff0000 100px")
  const positionMatch = trimmed.match(/\s+([\d.]+(%|px|em|rem)?)\s*$/);

  let colorStr = trimmed;
  let position: number | undefined;

  if (positionMatch) {
    colorStr = trimmed.slice(0, -positionMatch[0].length).trim();
    const posValue = positionMatch[1];

    if (posValue.endsWith('%')) {
      position = parseFloat(posValue);
    } else if (posValue.endsWith('px') || posValue.endsWith('em') || posValue.endsWith('rem')) {
      // Keep as-is for now, convert to percentage later if needed
      position = parseFloat(posValue);
    } else {
      position = parseFloat(posValue);
    }
  }

  // Parse the color
  const parsedColor = colorParser.parse(colorStr);

  return {
    color: parsedColor.value,
    position,
  };
}

/**
 * Parse linear gradient arguments
 */
export function parseLinearGradient(args: string[]): Partial<GradientValue> {
  const result: Partial<GradientValue> = {
    type: 'linear',
    angle: 180, // Default: to bottom
    stops: [],
  };

  let startIndex = 0;

  // Check if first argument is an angle or direction
  if (args.length > 0) {
    const firstArg = args[0].trim();
    const angleMatch = firstArg.match(LINEAR_ANGLE_PATTERN);

    if (angleMatch) {
      if (angleMatch[1]) {
        // Numeric angle
        result.angle = angleToDegreees(parseFloat(angleMatch[1]), angleMatch[2]);
      } else if (angleMatch[3]) {
        // Direction keyword
        result.angle = directionToAngle(angleMatch[3], angleMatch[4]);
      }
      startIndex = 1;
    }
  }

  // Parse color stops
  for (let i = startIndex; i < args.length; i++) {
    result.stops!.push(parseColorStop(args[i]));
  }

  return result;
}

/**
 * Parse radial gradient arguments
 */
export function parseRadialGradient(args: string[]): Partial<GradientValue> {
  const result: Partial<GradientValue> = {
    type: 'radial',
    shape: 'ellipse',
    size: 'farthest-corner',
    position: { x: '50%', y: '50%' },
    stops: [],
  };

  let startIndex = 0;

  // Check if first argument contains shape/size/position
  if (args.length > 0) {
    const firstArg = args[0].trim();

    // Check for shape and size
    const shapeMatch = firstArg.match(RADIAL_SHAPE_PATTERN);
    if (shapeMatch && (shapeMatch[1] || shapeMatch[2])) {
      if (shapeMatch[1]) {
        result.shape = shapeMatch[1].toLowerCase() as RadialShape;
      }
      if (shapeMatch[2]) {
        result.size = shapeMatch[2].toLowerCase() as RadialSize;
      }
    }

    // Check for position
    const posMatch = firstArg.match(POSITION_PATTERN);
    if (posMatch) {
      result.position = {
        x: parsePositionValue(posMatch[1]),
        y: posMatch[2] ? parsePositionValue(posMatch[2]) : '50%',
      };
    }

    // If we found shape, size, or position, skip first arg
    if (shapeMatch?.[1] || shapeMatch?.[2] || posMatch) {
      startIndex = 1;
    }
  }

  // Parse color stops
  for (let i = startIndex; i < args.length; i++) {
    result.stops!.push(parseColorStop(args[i]));
  }

  return result;
}

/**
 * Parse conic gradient arguments
 */
export function parseConicGradient(args: string[]): Partial<GradientValue> {
  const result: Partial<GradientValue> = {
    type: 'conic',
    fromAngle: 0,
    position: { x: '50%', y: '50%' },
    stops: [],
  };

  let startIndex = 0;

  // Check if first argument contains from angle or position
  if (args.length > 0) {
    const firstArg = args[0].trim();
    let hasConfig = false;

    // Check for from angle
    const fromMatch = firstArg.match(CONIC_FROM_PATTERN);
    if (fromMatch) {
      result.fromAngle = angleToDegreees(parseFloat(fromMatch[1]), fromMatch[2]);
      hasConfig = true;
    }

    // Check for position
    const posMatch = firstArg.match(POSITION_PATTERN);
    if (posMatch) {
      result.position = {
        x: parsePositionValue(posMatch[1]),
        y: posMatch[2] ? parsePositionValue(posMatch[2]) : '50%',
      };
      hasConfig = true;
    }

    if (hasConfig) {
      startIndex = 1;
    }
  }

  // Parse color stops
  for (let i = startIndex; i < args.length; i++) {
    result.stops!.push(parseColorStop(args[i]));
  }

  return result;
}
