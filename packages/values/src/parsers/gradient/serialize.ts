/**
 * Gradient Serialization
 *
 * Functions for serializing gradient values back to CSS strings.
 *
 * @module values/parsers/gradient/serialize
 */

import type { GradientValue, GradientStop, PositionValue } from './types';
import type { ColorValue } from '../color';

/**
 * Serialize a color value to string
 */
export function serializeColor(color: ColorValue): string {
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
export function serializeStop(stop: GradientStop): string {
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

/**
 * Serialize gradient value to CSS string
 */
export function serializeGradient(gradient: GradientValue): string {
  const { type, angle, shape, size, position, fromAngle, stops, repeating } = gradient;

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
