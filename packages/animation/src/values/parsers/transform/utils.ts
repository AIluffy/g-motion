/**
 * Transform Parsing Utilities
 *
 * Helper functions for parsing CSS transform strings and transform origins.
 *
 * @module values/parsers/transform/utils
 */

import type { TransformOrigin } from './types';

/** Regex to match individual transform functions */
const TRANSFORM_FUNCTION_REGEX = /(\w+)\s*\(\s*([^)]+)\s*\)/g;

/** Regex to detect if a string is a CSS transform */
export const TRANSFORM_DETECT_REGEX =
  /^(?:\s*(?:translate(?:X|Y|Z|3d)?|rotate(?:X|Y|Z|3d)?|scale(?:X|Y|Z|3d)?|skew(?:X|Y)?|matrix(?:3d)?|perspective)\s*\([^)]*\)\s*)+$/i;

/**
 * Parse a CSS transform string into individual functions
 */
export function parseTransformString(transform: string): Map<string, number[]> {
  const functions = new Map<string, number[]>();
  let match: RegExpExecArray | null;

  TRANSFORM_FUNCTION_REGEX.lastIndex = 0;
  while ((match = TRANSFORM_FUNCTION_REGEX.exec(transform)) !== null) {
    const name = match[1].toLowerCase();
    const args = match[2]
      .split(/[,\s]+/)
      .map((v) => parseFloat(v.replace(/[a-z%]+$/i, '')))
      .filter((v) => !isNaN(v));
    functions.set(name, args);
  }

  return functions;
}

/**
 * Parse transform origin string
 * @param value - CSS transform-origin string
 * @returns Parsed transform origin object
 */
export function parseTransformOrigin(value: string): TransformOrigin {
  const parts = value.trim().split(/\s+/);
  const result: TransformOrigin = { x: '50%', y: '50%' };

  const parseValue = (v: string): number | string => {
    if (v === 'left') return '0%';
    if (v === 'center') return '50%';
    if (v === 'right') return '100%';
    if (v === 'top') return '0%';
    if (v === 'bottom') return '100%';
    if (v.endsWith('%')) return v;
    const num = parseFloat(v);
    return isNaN(num) ? v : num;
  };

  if (parts.length >= 1) {
    result.x = parseValue(parts[0]);
  }
  if (parts.length >= 2) {
    result.y = parseValue(parts[1]);
  }
  if (parts.length >= 3) {
    const z = parseFloat(parts[2]);
    if (!isNaN(z)) {
      result.z = z;
    }
  }

  return result;
}
