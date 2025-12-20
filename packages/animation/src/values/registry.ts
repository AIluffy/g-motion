/**
 * Value Parser Registry
 *
 * Central registry for value parsers that handles automatic type detection,
 * parser selection, and value interpolation. Parsers are registered with
 * priorities to control detection order.
 *
 * @module values/registry
 */

import {
  ValueType,
  ValueParser,
  ParsedValue,
  ParserRegistrationOptions,
  DetectionResult,
} from './types';

/**
 * Internal parser entry with priority
 */
interface ParserEntry {
  parser: ValueParser;
  priority: number;
}

/**
 * Registry for value parsers
 *
 * Manages registration, detection, and interpolation of values using
 * registered parsers. Supports priority-based detection ordering.
 */
export class ValueParserRegistry {
  /** Map of parsers by value type */
  private parsers: Map<ValueType, ParserEntry> = new Map();

  /** Ordered list of parsers for detection (sorted by priority) */
  private detectionOrder: ParserEntry[] = [];

  /**
   * Register a value parser
   *
   * @param parser - The parser to register
   * @param options - Registration options including priority
   */
  register(parser: ValueParser, options: ParserRegistrationOptions = {}): void {
    const priority = options.priority ?? 0;
    const entry: ParserEntry = { parser, priority };

    // Store by type
    this.parsers.set(parser.type, entry);

    // Update detection order
    this.detectionOrder = this.detectionOrder.filter((e) => e.parser.type !== parser.type);
    this.detectionOrder.push(entry);
    this.detectionOrder.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregister a parser by type
   *
   * @param type - The value type to unregister
   * @returns true if a parser was removed
   */
  unregister(type: ValueType): boolean {
    const existed = this.parsers.delete(type);
    if (existed) {
      this.detectionOrder = this.detectionOrder.filter((e) => e.parser.type !== type);
    }
    return existed;
  }

  /**
   * Detect value type and return appropriate parser
   *
   * Iterates through registered parsers in priority order and returns
   * the first parser that can handle the value.
   *
   * @param value - The value to detect
   * @returns The matching parser or undefined if no match
   */
  detect(value: unknown): ValueParser | undefined {
    for (const entry of this.detectionOrder) {
      if (entry.parser.detect(value)) {
        return entry.parser;
      }
    }
    return undefined;
  }

  /**
   * Detect value type with confidence information
   *
   * @param value - The value to detect
   * @returns Detection result with confidence or undefined
   */
  detectWithConfidence(value: unknown): DetectionResult | undefined {
    for (const entry of this.detectionOrder) {
      if (entry.parser.detect(value)) {
        return {
          type: entry.parser.type,
          confidence: 1.0, // Binary detection for now
          parser: entry.parser,
        };
      }
    }
    return undefined;
  }

  /**
   * Get parser by type
   *
   * @param type - The value type
   * @returns The parser for the type or undefined
   */
  get(type: ValueType): ValueParser | undefined {
    return this.parsers.get(type)?.parser;
  }

  /**
   * Check if a parser is registered for a type
   *
   * @param type - The value type to check
   * @returns true if a parser is registered
   */
  has(type: ValueType): boolean {
    return this.parsers.has(type);
  }

  /**
   * Parse value using auto-detection
   *
   * Automatically detects the value type and parses it using the
   * appropriate parser. Falls back to string type if no parser matches.
   *
   * @param value - The value to parse
   * @returns The parsed value
   * @throws {ValueParseError} If parsing fails and no fallback is available
   */
  parse(value: unknown): ParsedValue {
    const parser = this.detect(value);

    if (parser) {
      return parser.parse(value);
    }

    // Fallback: try string parser if available
    const stringParser = this.get(ValueType.String);
    if (stringParser) {
      console.warn(`[ValueParserRegistry] Unknown value type, falling back to string: ${value}`);
      return stringParser.parse(value);
    }

    // No fallback available - return basic parsed value
    console.warn(`[ValueParserRegistry] No parser found for value: ${value}`);
    return {
      type: ValueType.String,
      value: String(value),
      original: typeof value === 'string' || typeof value === 'number' ? value : String(value),
    };
  }

  /**
   * Interpolate between two values
   *
   * Automatically detects value types and interpolates using the
   * appropriate parser. Both values should be of the same type.
   *
   * @param from - The starting value
   * @param to - The ending value
   * @param progress - The interpolation progress (0-1)
   * @returns The interpolated value (serialized)
   */
  interpolate(from: unknown, to: unknown, progress: number): unknown {
    // Detect types
    const fromParser = this.detect(from);
    const toParser = this.detect(to);

    // Use the 'from' parser if available, otherwise 'to' parser
    const parser = fromParser || toParser;

    if (!parser) {
      // No parser found - linear interpolation for numbers, or return 'to' at end
      if (typeof from === 'number' && typeof to === 'number') {
        return from + (to - from) * progress;
      }
      return progress < 1 ? from : to;
    }

    // Parse both values
    const fromParsed = parser.parse(from);
    const toParsed = parser.parse(to);

    // Interpolate
    const interpolated = parser.interpolate(fromParsed.value, toParsed.value, progress);

    // Serialize result
    return parser.serialize({
      type: parser.type,
      value: interpolated,
      original: fromParsed.original,
    });
  }

  /**
   * Get all registered parser types
   *
   * @returns Array of registered value types
   */
  getRegisteredTypes(): ValueType[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Get the number of registered parsers
   *
   * @returns The count of registered parsers
   */
  get size(): number {
    return this.parsers.size;
  }

  /**
   * Clear all registered parsers
   */
  clear(): void {
    this.parsers.clear();
    this.detectionOrder = [];
  }
}

/**
 * Default global registry instance
 */
export const defaultRegistry = new ValueParserRegistry();
