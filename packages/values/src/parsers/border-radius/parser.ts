/**
 * Border Radius Parser
 *
 * Parser for border-radius values implementing the ValueParser interface.
 *
 * @module values/parsers/border-radius/parser
 */

import { ValueType, ValueParser, ParsedValue, ValueParseError } from '../../types';
import type { BorderRadiusValue, BorderRadiusCorner, BorderRadiusContext } from './types';
import { BORDER_RADIUS_PATTERNS, parseRadiusValues, expandRadiusValues } from './utils';
import { normalizeUnits } from './convert';
import { unitParser } from '../unit';

/**
 * Parser for border-radius values
 */
export class BorderRadiusParser implements ValueParser<BorderRadiusValue> {
  readonly type = ValueType.Unit;

  /**
   * Detect if a value is a border-radius value
   */
  detect(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();

    return (
      BORDER_RADIUS_PATTERNS.single.test(trimmed) ||
      BORDER_RADIUS_PATTERNS.multiple.test(trimmed) ||
      BORDER_RADIUS_PATTERNS.elliptical.test(trimmed)
    );
  }

  /**
   * Parse a border-radius value
   */
  parse(value: unknown): ParsedValue<BorderRadiusValue> {
    if (typeof value !== 'string') {
      throw new ValueParseError(value, ValueType.Unit, 'Value must be a string');
    }

    const trimmed = value.trim();
    let horizontalValues, verticalValues;

    // Check for elliptical format first
    const ellipticalMatch = trimmed.match(BORDER_RADIUS_PATTERNS.elliptical);
    if (ellipticalMatch) {
      horizontalValues = parseRadiusValues(ellipticalMatch[1]);
      verticalValues = parseRadiusValues(ellipticalMatch[2]);
    } else {
      horizontalValues = parseRadiusValues(trimmed);
      verticalValues = [...horizontalValues];
    }

    // Expand to 4 corners
    const [hTL, hTR, hBR, hBL] = expandRadiusValues(horizontalValues);
    const [vTL, vTR, vBR, vBL] = expandRadiusValues(verticalValues);

    return {
      type: ValueType.Unit,
      value: {
        topLeft: { horizontal: hTL, vertical: vTL },
        topRight: { horizontal: hTR, vertical: vTR },
        bottomRight: { horizontal: hBR, vertical: vBR },
        bottomLeft: { horizontal: hBL, vertical: vBL },
      },
      original: value,
    };
  }

  /**
   * Serialize a border-radius value back to string
   */
  serialize(parsed: ParsedValue<BorderRadiusValue>): string {
    const { topLeft, topRight, bottomRight, bottomLeft } = parsed.value;

    // Check if all corners are the same
    const allSame =
      this.cornersEqual(topLeft, topRight) &&
      this.cornersEqual(topRight, bottomRight) &&
      this.cornersEqual(bottomRight, bottomLeft);

    if (allSame) {
      if (
        topLeft.horizontal.value === topLeft.vertical.value &&
        topLeft.horizontal.unit === topLeft.vertical.unit
      ) {
        return unitParser.serialize({
          type: ValueType.Unit,
          value: topLeft.horizontal,
          original: '',
        });
      } else {
        const h = unitParser.serialize({
          type: ValueType.Unit,
          value: topLeft.horizontal,
          original: '',
        });
        const v = unitParser.serialize({
          type: ValueType.Unit,
          value: topLeft.vertical,
          original: '',
        });
        return `${h} / ${v}`;
      }
    }

    // Check if we need elliptical format
    const needsElliptical =
      topLeft.horizontal.value !== topLeft.vertical.value ||
      topRight.horizontal.value !== topRight.vertical.value ||
      bottomRight.horizontal.value !== bottomRight.vertical.value ||
      bottomLeft.horizontal.value !== bottomLeft.vertical.value ||
      topLeft.horizontal.unit !== topLeft.vertical.unit ||
      topRight.horizontal.unit !== topRight.vertical.unit ||
      bottomRight.horizontal.unit !== bottomRight.vertical.unit ||
      bottomLeft.horizontal.unit !== bottomLeft.vertical.unit;

    if (needsElliptical) {
      const hValues = [
        unitParser.serialize({ type: ValueType.Unit, value: topLeft.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: topRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomLeft.horizontal, original: '' }),
      ];
      const vValues = [
        unitParser.serialize({ type: ValueType.Unit, value: topLeft.vertical, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: topRight.vertical, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomRight.vertical, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomLeft.vertical, original: '' }),
      ];

      return `${hValues.join(' ')} / ${vValues.join(' ')}`;
    } else {
      const values = [
        unitParser.serialize({ type: ValueType.Unit, value: topLeft.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: topRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomRight.horizontal, original: '' }),
        unitParser.serialize({ type: ValueType.Unit, value: bottomLeft.horizontal, original: '' }),
      ];

      return values.join(' ');
    }
  }

  /**
   * Interpolate between two border-radius values
   */
  interpolate(
    from: BorderRadiusValue,
    to: BorderRadiusValue,
    progress: number,
    context?: BorderRadiusContext,
  ): BorderRadiusValue {
    return {
      topLeft: this.interpolateCorner(from.topLeft, to.topLeft, progress, context),
      topRight: this.interpolateCorner(from.topRight, to.topRight, progress, context),
      bottomRight: this.interpolateCorner(from.bottomRight, to.bottomRight, progress, context),
      bottomLeft: this.interpolateCorner(from.bottomLeft, to.bottomLeft, progress, context),
    };
  }

  /**
   * Check if two corners are equal
   */
  private cornersEqual(corner1: BorderRadiusCorner, corner2: BorderRadiusCorner): boolean {
    return (
      corner1.horizontal.value === corner2.horizontal.value &&
      corner1.horizontal.unit === corner2.horizontal.unit &&
      corner1.vertical.value === corner2.vertical.value &&
      corner1.vertical.unit === corner2.vertical.unit
    );
  }

  /**
   * Interpolate between two corner values
   */
  private interpolateCorner(
    from: BorderRadiusCorner,
    to: BorderRadiusCorner,
    progress: number,
    context?: BorderRadiusContext,
  ): BorderRadiusCorner {
    const [fromH, toH] = normalizeUnits(from.horizontal, to.horizontal, context);
    const [fromV, toV] = normalizeUnits(from.vertical, to.vertical, context);

    return {
      horizontal: unitParser.interpolate(fromH, toH, progress),
      vertical: unitParser.interpolate(fromV, toV, progress),
    };
  }
}
