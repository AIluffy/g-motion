/**
 * Shadow Parser
 *
 * Parser for shadow values implementing the ValueParser interface.
 *
 * @module values/parsers/shadow/parser
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../../core/types';
import type { ShadowsValue, ShadowValue } from './types';
import {
  BOX_SHADOW_PATTERN,
  TEXT_SHADOW_PATTERN,
  SHADOW_SEPARATOR,
  parseSingleShadow,
} from './utils';
import { serializeSingleShadow } from './serialize';
import { interpolateSingleShadow, normalizeShadowCounts } from './interpolate';

/**
 * Parser for shadow values (box-shadow and text-shadow)
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

    if (!trimmed || trimmed === 'none') {
      return false;
    }

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
      const shadowStrings = trimmed.split(SHADOW_SEPARATOR);
      const shadows: ShadowValue[] = [];

      // Detect if this is text-shadow
      let isTextShadow = true;

      for (const shadowStr of shadowStrings) {
        const s = shadowStr.trim();
        if (!s) continue;

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
    const [normalizedFrom, normalizedTo] = normalizeShadowCounts(from.shadows, to.shadows);

    const interpolatedShadows = normalizedFrom.map((fromShadow, i) =>
      interpolateSingleShadow(fromShadow, normalizedTo[i], progress),
    );

    return {
      shadows: interpolatedShadows,
      isTextShadow: progress < 0.5 ? from.isTextShadow : to.isTextShadow,
    };
  }
}
