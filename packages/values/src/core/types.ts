/**
 * Value Type System for Enhanced Motion Capabilities
 *
 * This module defines the core types and interfaces for the value parsing
 * and interpolation system. It supports automatic detection and handling
 * of various value types including colors, units, paths, gradients, etc.
 *
 * @module values/types
 */

/**
 * Supported value types for animation
 * Used for automatic type detection and parser selection
 */
export enum ValueType {
  /** Pure numeric values (e.g., 0, 100, 3.14) */
  Number = 'number',
  /** Color values in various formats (hex, rgb, hsl, named) */
  Color = 'color',
  /** Values with CSS units (px, em, rem, %, deg, etc.) */
  Unit = 'unit',
  /** SVG path data strings */
  Path = 'path',
  /** CSS gradient values (linear, radial, conic) */
  Gradient = 'gradient',
  /** Box-shadow and text-shadow values */
  Shadow = 'shadow',
  /** CSS transform values */
  Transform = 'transform',
  /** Generic string values */
  String = 'string',
  /** Array of values */
  Array = 'array',
  /** Vector values (vec2, vec3, vec4) */
  Vector = 'vector',
  /** Matrix values (mat3, mat4) */
  Matrix = 'matrix',
}

/**
 * Parsed value representation
 * Contains the parsed data along with metadata about the original value
 *
 * @template T - The type of the parsed value
 */
export interface ParsedValue<T = unknown> {
  /** The detected value type */
  type: ValueType;
  /** The parsed value data */
  value: T;
  /** Optional unit string (for unit values) */
  unit?: string;
  /** The original raw value before parsing */
  original: string | number;
}

/**
 * Value parser interface
 * Implementations handle detection, parsing, serialization, and interpolation
 * for specific value types
 *
 * @template T - The type of the parsed value
 */
export interface ValueParser<T = unknown> {
  /** The value type this parser handles */
  readonly type: ValueType;

  /**
   * Detect if a value matches this parser's type
   * @param value - The value to check
   * @returns true if this parser can handle the value
   */
  detect(value: unknown): boolean;

  /**
   * Parse a raw value into a structured format
   * @param value - The raw value to parse
   * @returns The parsed value with metadata
   * @throws {ValueParseError} If parsing fails
   */
  parse(value: unknown): ParsedValue<T>;

  /**
   * Serialize a parsed value back to its string/number representation
   * @param parsed - The parsed value to serialize
   * @returns The serialized value
   */
  serialize(parsed: ParsedValue<T>): string | number;

  /**
   * Interpolate between two parsed values
   * @param from - The starting value
   * @param to - The ending value
   * @param progress - The interpolation progress (0-1)
   * @returns The interpolated value
   */
  interpolate(from: T, to: T, progress: number): T;
}

/**
 * Error thrown when value parsing fails
 */
export class ValueParseError extends Error {
  constructor(
    /** The value that failed to parse */
    public readonly value: unknown,
    /** The expected value type */
    public readonly expectedType: ValueType,
    /** Additional error details */
    public readonly details?: string,
  ) {
    super(`Failed to parse value as ${expectedType}: ${details || 'Unknown error'}`);
    this.name = 'ValueParseError';
  }
}

/**
 * Options for value parser registration
 */
export interface ParserRegistrationOptions {
  /** Priority for detection order (higher = checked first) */
  priority?: number;
}

/**
 * Result of value type detection
 */
export interface DetectionResult {
  /** The detected value type */
  type: ValueType;
  /** Confidence score (0-1) */
  confidence: number;
  /** The parser that matched */
  parser: ValueParser;
}
