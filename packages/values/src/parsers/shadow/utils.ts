/**
 * Shadow Parsing Utilities
 *
 * Helper functions for parsing shadow values.
 *
 * @module values/parsers/shadow/utils
 */

import type { ColorValue } from '../color';
import { ColorParser } from '../color';
import type { ShadowValue } from './types';

// Color parser instance
const colorParser = new ColorParser();

// Regex patterns for shadow detection
export const BOX_SHADOW_PATTERN =
  /^(?:inset\s+)?(?:-?[\d.]+(?:px|em|rem)?\s+){2,4}(?:#[0-9a-f]{3,8}|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\)|[a-z]+)(?:\s+inset)?/i;
export const TEXT_SHADOW_PATTERN =
  /^(?:-?[\d.]+(?:px|em|rem)?\s+){2,3}(?:#[0-9a-f]{3,8}|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\)|[a-z]+)/i;
export const SHADOW_SEPARATOR = /,(?![^(]*\))/; // Split by comma, but not inside parentheses

/**
 * Parse a length value (with optional unit) to pixels
 */
function parseLength(value: string): number {
  const match = value.match(/^([\d.]+)(px|em|rem)?$/i);
  if (!match) {
    return 0;
  }
  const num = parseFloat(match[1]);
  return num;
}

/**
 * Parse a single shadow string
 */
export function parseSingleShadow(shadowStr: string, isTextShadow: boolean = false): ShadowValue {
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

  // Extract color
  let color: ColorValue = { r: 0, g: 0, b: 0, a: 1 };
  let colorFound = false;

  // Try to find color at the end first
  const colorPatterns = [
    /\s+(rgba?\s*\([^)]+\))\s*$/i,
    /\s+(hsla?\s*\([^)]+\))\s*$/i,
    /\s+(#[0-9a-f]{3,8})\s*$/i,
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

  // Parse numeric values
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
