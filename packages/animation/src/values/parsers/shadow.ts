/**
 * Shadow Value Parser
 *
 * Handles parsing and interpolation of shadow values:
 * - box-shadow: offset-x offset-y blur spread color [inset]
 * - text-shadow: offset-x offset-y blur color
 * - Multiple shadows separated by commas
 *
 * @module values/parsers/shadow
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../types';
import { ColorParser, ColorValue } from './color';

/**
 * Single shadow value representation
 */
export interface ShadowValue {
  /** Horizontal offset in pixels */
  offsetX: number;
  /** Vertical offset in pixels */
  offsetY: number;
  /** Blur radius in pixels */
  blur: number;
  /** Spread radius in pixels (box-shadow only) */
  spread?: number;
  /** Shadow color */
  color: ColorValue;
  /** Whether the shadow is inset (box-shadow only) */
  inset?: boolean;
}

/**
 * Multiple shadows value representation
 */
export interface ShadowsValue {
  /** Array of individual shadows */
  shadows: ShadowValue[];
  /** Whether this is a text-shadow (no spread/inset) */
  isTextShadow?: boolean;
}

// Color parser instance for parsing shadow colors
const colorParser = new ColorParser();

// Default transparent color for normalization
const TRANSPARENT_COLOR: ColorValue = { r: 0, g: 0, b: 0, a: 0 };

// Regex patterns for shadow detection
// Match rgba/hsla with full parentheses content, hex colors, or named colors
const BOX_SHADOW_PATTERN =
  /^(?:inset\s+)?(?:-?[\d.]+(?:px|em|rem)?\s+){2,4}(?:#[0-9a-f]{3,8}|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\)|[a-z]+)(?:\s+inset)?/i;
const TEXT_SHADOW_PATTERN =
  /^(?:-?[\d.]+(?:px|em|rem)?\s+){2,3}(?:#[0-9a-f]{3,8}|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\)|[a-z]+)/i;
const SHADOW_SEPARATOR = /,(?![^(]*\))/; // Split by comma, but not inside parentheses

/**
 * Parse a length value (with optional unit) to pixels
 */
function parseLength(value: string): number {
  const match = value.match(/^([\d.]+)(px|em|rem)?$/i);
  if (!match) {
    return 0;
  }
  const num = parseFloat(match[1]);
  // For simplicity, treat all units as pixels
  // In a real implementation, you'd need element context for em/rem
  return num;
}

/**
 * Parse a single shadow string
 */
function parseSingleShadow(shadowStr: string, isTextShadow: boolean = false): ShadowValue {
  const trimmed = shadowStr.trim();

  // Check for inset keyword
  let inset = false;
  let workingStr = trimmed;

  if (!isTextShadow) {
    if (workingStr.toLowerCase().startsWith('inset')) {
      inset = true;
      workingStr = workingStr.slice(5).trim();
    } else if (workingStr.toLowerCase().endsWith('inset')) {
      inset = true;
      workingStr = workingStr.slice(0, -5).trim();
    }
  }

  // Extract color - it can be at the beginning or end
  let color: ColorValue = { r: 0, g: 0, b: 0, a: 1 }; // Default black
  let colorFound = false;

  // Try to find color at the end first (most common)
  // Match hex, rgb(), rgba(), hsl(), hsla(), or named colors
  const colorPatterns = [
    // rgba/rgb with parentheses
    /\s+(rgba?\s*\([^)]+\))\s*$/i,
    // hsla/hsl with parentheses
    /\s+(hsla?\s*\([^)]+\))\s*$/i,
    // hex color
    /\s+(#[0-9a-f]{3,8})\s*$/i,
    // named color at end (word boundary)
    /\s+([a-z]+)\s*$/i,
  ];

  for (const pattern of colorPatterns) {
    const match = workingStr.match(pattern);
    if (match && colorParser.detect(match[1])) {
      try {
        const parsed = colorParser.parse(match[1]);
        color = parsed.value;
        colorFound = true;
        workingStr = workingStr.slice(0, match.index).trim();
        break;
      } catch {
        // Not a valid color, continue
      }
    }
  }

  // If no color found at end, try beginning
  if (!colorFound) {
    const beginPatterns = [
      /^(rgba?\s*\([^)]+\))\s+/i,
      /^(hsla?\s*\([^)]+\))\s+/i,
      /^(#[0-9a-f]{3,8})\s+/i,
      /^([a-z]+)\s+/i,
    ];

    for (const pattern of beginPatterns) {
      const match = workingStr.match(pattern);
      if (match && colorParser.detect(match[1])) {
        try {
          const parsed = colorParser.parse(match[1]);
          color = parsed.value;
          colorFound = true;
          workingStr = workingStr.slice(match[0].length).trim();
          break;
        } catch {
          // Not a valid color, continue
        }
      }
    }
  }

  // Parse numeric values (offset-x, offset-y, blur, spread)
  const parts = workingStr.split(/\s+/).filter((p) => p.length > 0);

  const offsetX = parts[0] ? parseLength(parts[0]) : 0;
  const offsetY = parts[1] ? parseLength(parts[1]) : 0;
  const blur = parts[2] ? parseLength(parts[2]) : 0;
  const spread = !isTextShadow && parts[3] ? parseLength(parts[3]) : undefined;

  return {
    offsetX,
    offsetY,
    blur,
    spread,
    color,
    inset: inset || undefined,
  };
}

/**
 * Serialize a single shadow to string
 */
function serializeSingleShadow(shadow: ShadowValue, isTextShadow: boolean = false): string {
  const parts: string[] = [];

  // Add inset if present (box-shadow only)
  if (!isTextShadow && shadow.inset) {
    parts.push('inset');
  }

  // Add offset-x and offset-y
  parts.push(`${shadow.offsetX}px`);
  parts.push(`${shadow.offsetY}px`);

  // Add blur
  parts.push(`${shadow.blur}px`);

  // Add spread (box-shadow only)
  if (!isTextShadow && shadow.spread !== undefined) {
    parts.push(`${shadow.spread}px`);
  }

  // Add color
  const { r, g, b, a } = shadow.color;
  const rr = Math.round(r);
  const gg = Math.round(g);
  const bb = Math.round(b);

  if (a < 1) {
    parts.push(`rgba(${rr}, ${gg}, ${bb}, ${Number(a.toFixed(3))})`);
  } else {
    parts.push(`rgb(${rr}, ${gg}, ${bb})`);
  }

  return parts.join(' ');
}

/**
 * Interpolate between two shadow values
 */
function interpolateSingleShadow(
  from: ShadowValue,
  to: ShadowValue,
  progress: number,
): ShadowValue {
  return {
    offsetX: from.offsetX + (to.offsetX - from.offsetX) * progress,
    offsetY: from.offsetY + (to.offsetY - from.offsetY) * progress,
    blur: from.blur + (to.blur - from.blur) * progress,
    spread:
      from.spread !== undefined && to.spread !== undefined
        ? from.spread + (to.spread - from.spread) * progress
        : (from.spread ?? to.spread),
    color: {
      r: from.color.r + (to.color.r - from.color.r) * progress,
      g: from.color.g + (to.color.g - from.color.g) * progress,
      b: from.color.b + (to.color.b - from.color.b) * progress,
      a: from.color.a + (to.color.a - from.color.a) * progress,
    },
    // Inset doesn't interpolate - use the target value at progress > 0.5
    inset: progress < 0.5 ? from.inset : to.inset,
  };
}

/**
 * Create a transparent shadow for normalization
 */
function createTransparentShadow(template?: ShadowValue): ShadowValue {
  return {
    offsetX: template?.offsetX ?? 0,
    offsetY: template?.offsetY ?? 0,
    blur: template?.blur ?? 0,
    spread: template?.spread,
    color: { ...TRANSPARENT_COLOR },
    inset: template?.inset,
  };
}

/**
 * Normalize shadow arrays to have the same length
 * Adds transparent shadows to the shorter array
 */
export function normalizeShadowCounts(
  from: ShadowValue[],
  to: ShadowValue[],
): [ShadowValue[], ShadowValue[]] {
  const maxLength = Math.max(from.length, to.length);

  const normalizedFrom = [...from];
  const normalizedTo = [...to];

  // Pad shorter array with transparent shadows
  while (normalizedFrom.length < maxLength) {
    const template = normalizedTo[normalizedFrom.length];
    normalizedFrom.push(createTransparentShadow(template));
  }

  while (normalizedTo.length < maxLength) {
    const template = normalizedFrom[normalizedTo.length];
    normalizedTo.push(createTransparentShadow(template));
  }

  return [normalizedFrom, normalizedTo];
}

// ============================================================================
// Shadow Parser Class
// ============================================================================

/**
 * Parser for shadow values (box-shadow and text-shadow)
 *
 * Supports:
 * - box-shadow with offset, blur, spread, color, and inset
 * - text-shadow with offset, blur, and color
 * - Multiple shadows separated by commas
 */
export class ShadowParser implements ValueParser<ShadowsValue> {
  readonly type = ValueType.Shadow;

  /**
   * Detect if a value is a shadow
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim().toLowerCase();

    // Empty or 'none' is not a shadow
    if (!trimmed || trimmed === 'none') {
      return false;
    }

    // Check if it matches shadow patterns
    // Split by comma (not inside parentheses) and check each part
    const parts = trimmed.split(SHADOW_SEPARATOR);

    for (const part of parts) {
      const p = part.trim();
      if (BOX_SHADOW_PATTERN.test(p) || TEXT_SHADOW_PATTERN.test(p)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse a shadow value
   */
  parse(value: unknown): ParsedValue<ShadowsValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Shadow, 'Value must be a string');
    }

    const trimmed = value.trim();

    if (!trimmed || trimmed.toLowerCase() === 'none') {
      return {
        type: ValueType.Shadow,
        value: { shadows: [] },
        original: value,
      };
    }

    try {
      // Split by comma (not inside parentheses)
      const shadowStrings = trimmed.split(SHADOW_SEPARATOR);
      const shadows: ShadowValue[] = [];

      // Detect if this is text-shadow (no spread values)
      // We'll determine this by checking if any shadow has 4 numeric values
      let isTextShadow = true;

      for (const shadowStr of shadowStrings) {
        const s = shadowStr.trim();
        if (!s) continue;

        // Count numeric values to determine shadow type
        const numericParts = s.match(/[\d.]+(?:px|em|rem)?/gi) || [];
        if (numericParts.length >= 4) {
          isTextShadow = false;
        }
      }

      for (const shadowStr of shadowStrings) {
        const s = shadowStr.trim();
        if (!s) continue;

        shadows.push(parseSingleShadow(s, isTextShadow));
      }

      return {
        type: ValueType.Shadow,
        value: { shadows, isTextShadow },
        original: value,
      };
    } catch (error) {
      throw new ValueParseError(
        value,
        ValueType.Shadow,
        error instanceof Error ? error.message : 'Unknown parsing error',
      );
    }
  }

  /**
   * Serialize shadows back to CSS string
   */
  serialize(parsed: ParsedValue<ShadowsValue>): string {
    const { shadows, isTextShadow } = parsed.value;

    if (shadows.length === 0) {
      return 'none';
    }

    return shadows.map((shadow) => serializeSingleShadow(shadow, isTextShadow)).join(', ');
  }

  /**
   * Interpolate between two shadow values
   */
  interpolate(from: ShadowsValue, to: ShadowsValue, progress: number): ShadowsValue {
    // Normalize shadow counts
    const [normalizedFrom, normalizedTo] = normalizeShadowCounts(from.shadows, to.shadows);

    // Interpolate each shadow
    const interpolatedShadows = normalizedFrom.map((fromShadow, i) =>
      interpolateSingleShadow(fromShadow, normalizedTo[i], progress),
    );

    return {
      shadows: interpolatedShadows,
      isTextShadow: progress < 0.5 ? from.isTextShadow : to.isTextShadow,
    };
  }
}

/**
 * Default shadow parser instance
 */
export const shadowParser = new ShadowParser();
