/**
 * Gradient Value Parser
 *
 * Handles parsing and interpolation of CSS gradient values:
 * - linear-gradient
 * - radial-gradient
 * - conic-gradient
 *
 * @module values/parsers/gradient
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../types';
import { ColorParser, ColorValue, interpolateRgb } from './color';

/**
 * Gradient color stop
 */
export interface GradientStop {
  /** Color at this stop */
  color: ColorValue;
  /** Position as percentage (0-100), undefined for auto-positioned stops */
  position?: number;
}

/**
 * Gradient type
 */
export type GradientType = 'linear' | 'radial' | 'conic';

/**
 * Radial gradient shape
 */
export type RadialShape = 'circle' | 'ellipse';

/**
 * Radial gradient size keyword
 */
export type RadialSize = 'closest-side' | 'closest-corner' | 'farthest-side' | 'farthest-corner';

/**
 * Position value (can be percentage, pixel, or keyword)
 */
export interface PositionValue {
  x: number | string;
  y: number | string;
}

/**
 * Gradient value representation
 */
export interface GradientValue {
  /** Type of gradient */
  type: GradientType;
  /** Angle in degrees (for linear gradients) */
  angle?: number;
  /** Shape (for radial gradients) */
  shape?: RadialShape;
  /** Size keyword (for radial gradients) */
  size?: RadialSize;
  /** Center position (for radial and conic gradients) */
  position?: PositionValue;
  /** Starting angle in degrees (for conic gradients) */
  fromAngle?: number;
  /** Color stops */
  stops: GradientStop[];
  /** Whether this is a repeating gradient */
  repeating?: boolean;
}

// Color parser instance for parsing color stops
const colorParser = new ColorParser();

// ============================================================================
// Regex Patterns
// ============================================================================

/** Pattern to detect gradient functions */
const GRADIENT_PATTERN = /^(repeating-)?(linear|radial|conic)-gradient\s*\(/i;

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

// ============================================================================
// Parsing Helpers
// ============================================================================

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
function splitGradientArgs(content: string): string[] {
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
function parseColorStop(stopStr: string): GradientStop {
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
function parseLinearGradient(args: string[]): Partial<GradientValue> {
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
function parseRadialGradient(args: string[]): Partial<GradientValue> {
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
function parseConicGradient(args: string[]): Partial<GradientValue> {
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

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Serialize a color value to string
 */
function serializeColor(color: ColorValue): string {
  const r = Math.round(color.r);
  const g = Math.round(color.g);
  const b = Math.round(color.b);

  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(3)})`;
  }

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Serialize a gradient stop
 */
function serializeStop(stop: GradientStop): string {
  const colorStr = serializeColor(stop.color);

  if (stop.position !== undefined) {
    return `${colorStr} ${stop.position}%`;
  }

  return colorStr;
}

/**
 * Serialize position value
 */
function serializePosition(pos: PositionValue): string {
  const x = typeof pos.x === 'number' ? `${pos.x}%` : pos.x;
  const y = typeof pos.y === 'number' ? `${pos.y}%` : pos.y;
  return `at ${x} ${y}`;
}

// ============================================================================
// Interpolation Helpers
// ============================================================================

/**
 * Interpolate between two numbers
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Normalize stops to have explicit positions
 */
function normalizeStops(stops: GradientStop[]): GradientStop[] {
  if (stops.length === 0) return [];
  if (stops.length === 1) {
    return [{ ...stops[0], position: stops[0].position ?? 50 }];
  }

  const result: GradientStop[] = [];

  // First pass: copy stops and set first/last positions if missing
  for (let i = 0; i < stops.length; i++) {
    const stop = { ...stops[i] };

    if (i === 0 && stop.position === undefined) {
      stop.position = 0;
    } else if (i === stops.length - 1 && stop.position === undefined) {
      stop.position = 100;
    }

    result.push(stop);
  }

  // Second pass: fill in missing positions by interpolating
  let lastDefinedIndex = 0;

  for (let i = 1; i < result.length; i++) {
    if (result[i].position !== undefined) {
      // Fill in any gaps
      if (i - lastDefinedIndex > 1) {
        const startPos = result[lastDefinedIndex].position!;
        const endPos = result[i].position!;
        const count = i - lastDefinedIndex;

        for (let j = lastDefinedIndex + 1; j < i; j++) {
          const t = (j - lastDefinedIndex) / count;
          result[j].position = startPos + (endPos - startPos) * t;
        }
      }
      lastDefinedIndex = i;
    }
  }

  return result;
}

/**
 * Match stop counts between two gradient stop arrays
 */
function matchStopCounts(
  from: GradientStop[],
  to: GradientStop[],
): [GradientStop[], GradientStop[]] {
  const fromNorm = normalizeStops(from);
  const toNorm = normalizeStops(to);

  if (fromNorm.length === toNorm.length) {
    return [fromNorm, toNorm];
  }

  // Add transparent stops to the shorter array
  const maxLen = Math.max(fromNorm.length, toNorm.length);
  const fromResult: GradientStop[] = [];
  const toResult: GradientStop[] = [];

  for (let i = 0; i < maxLen; i++) {
    const fromIdx = Math.min(i, fromNorm.length - 1);
    const toIdx = Math.min(i, toNorm.length - 1);

    fromResult.push(fromNorm[fromIdx]);
    toResult.push(toNorm[toIdx]);
  }

  return [fromResult, toResult];
}

/**
 * Interpolate between two gradient stops
 */
function interpolateStop(from: GradientStop, to: GradientStop, progress: number): GradientStop {
  return {
    color: interpolateRgb(from.color, to.color, progress),
    position:
      from.position !== undefined && to.position !== undefined
        ? lerp(from.position, to.position, progress)
        : undefined,
  };
}

// ============================================================================
// Gradient Parser Class
// ============================================================================

/**
 * Parser for CSS gradient values
 *
 * Supports linear-gradient, radial-gradient, and conic-gradient,
 * including their repeating variants.
 */
export class GradientParser implements ValueParser<GradientValue> {
  readonly type = ValueType.Gradient;

  /**
   * Detect if a value is a gradient
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    return GRADIENT_PATTERN.test(value.trim());
  }

  /**
   * Parse a gradient value
   */
  parse(value: unknown): ParsedValue<GradientValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Gradient, 'Value must be a string');
    }

    const trimmed = value.trim();
    const match = trimmed.match(GRADIENT_PATTERN);

    if (!match) {
      throw new ValueParseError(value, ValueType.Gradient, 'Invalid gradient format');
    }

    const repeating = !!match[1];
    const gradientType = match[2].toLowerCase() as GradientType;

    // Extract content inside parentheses
    const startParen = trimmed.indexOf('(');
    const endParen = trimmed.lastIndexOf(')');

    if (startParen === -1 || endParen === -1 || endParen <= startParen) {
      throw new ValueParseError(value, ValueType.Gradient, 'Missing parentheses');
    }

    const content = trimmed.slice(startParen + 1, endParen);
    const args = splitGradientArgs(content);

    let gradientValue: Partial<GradientValue>;

    try {
      switch (gradientType) {
        case 'linear':
          gradientValue = parseLinearGradient(args);
          break;
        case 'radial':
          gradientValue = parseRadialGradient(args);
          break;
        case 'conic':
          gradientValue = parseConicGradient(args);
          break;
        default:
          throw new Error(`Unknown gradient type: ${gradientType}`);
      }
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Gradient,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }

    gradientValue.repeating = repeating;

    return {
      type: ValueType.Gradient,
      value: gradientValue as GradientValue,
      original: value,
    };
  }

  /**
   * Serialize a gradient back to CSS string
   */
  serialize(parsed: ParsedValue<GradientValue>): string {
    const { type, angle, shape, size, position, fromAngle, stops, repeating } = parsed.value;

    const prefix = repeating ? 'repeating-' : '';
    const stopsStr = stops.map(serializeStop).join(', ');

    switch (type) {
      case 'linear': {
        const angleStr = angle !== undefined ? `${angle}deg` : '';
        const parts = [angleStr, stopsStr].filter(Boolean);
        return `${prefix}linear-gradient(${parts.join(', ')})`;
      }

      case 'radial': {
        const shapeParts: string[] = [];
        if (shape) shapeParts.push(shape);
        if (size) shapeParts.push(size);
        if (position) shapeParts.push(serializePosition(position));

        const configStr = shapeParts.join(' ');
        const parts = [configStr, stopsStr].filter(Boolean);
        return `${prefix}radial-gradient(${parts.join(', ')})`;
      }

      case 'conic': {
        const configParts: string[] = [];
        if (fromAngle !== undefined && fromAngle !== 0) {
          configParts.push(`from ${fromAngle}deg`);
        }
        if (position) {
          configParts.push(serializePosition(position));
        }

        const configStr = configParts.join(' ');
        const parts = [configStr, stopsStr].filter(Boolean);
        return `${prefix}conic-gradient(${parts.join(', ')})`;
      }

      default:
        return `linear-gradient(${stopsStr})`;
    }
  }

  /**
   * Interpolate between two gradients
   */
  interpolate(from: GradientValue, to: GradientValue, progress: number): GradientValue {
    // If types don't match, snap at 0.5
    if (from.type !== to.type) {
      return progress < 0.5 ? { ...from } : { ...to };
    }

    // Match stop counts
    const [fromStops, toStops] = matchStopCounts(from.stops, to.stops);

    // Interpolate stops
    const interpolatedStops = fromStops.map((fromStop, i) =>
      interpolateStop(fromStop, toStops[i], progress),
    );

    const result: GradientValue = {
      type: from.type,
      stops: interpolatedStops,
      repeating: progress < 0.5 ? from.repeating : to.repeating,
    };

    // Interpolate type-specific properties
    switch (from.type) {
      case 'linear':
        if (from.angle !== undefined && to.angle !== undefined) {
          result.angle = lerp(from.angle, to.angle, progress);
        }
        break;

      case 'radial':
        result.shape = progress < 0.5 ? from.shape : to.shape;
        result.size = progress < 0.5 ? from.size : to.size;
        // Position interpolation would require more complex handling
        result.position = progress < 0.5 ? from.position : to.position;
        break;

      case 'conic':
        if (from.fromAngle !== undefined && to.fromAngle !== undefined) {
          result.fromAngle = lerp(from.fromAngle, to.fromAngle, progress);
        }
        result.position = progress < 0.5 ? from.position : to.position;
        break;
    }

    return result;
  }
}

/**
 * Default gradient parser instance
 */
export const gradientParser = new GradientParser();

/**
 * Export helper functions for external use
 */
export { normalizeStops, matchStopCounts, interpolateStop, serializeColor, serializeStop };
