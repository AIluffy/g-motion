/**
 * Gradient Interpolation
 *
 * Functions for interpolating between gradient values for smooth animations.
 *
 * @module values/parsers/gradient/interpolate
 */

import type { GradientValue, GradientStop } from './types';
import { interpolateRgb } from '../color';
import { lerp } from '@g-motion/utils';

/**
 * Normalize stops to have explicit positions
 */
export function normalizeStops(stops: GradientStop[]): GradientStop[] {
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
export function matchStopCounts(
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
export function interpolateStop(
  from: GradientStop,
  to: GradientStop,
  progress: number,
): GradientStop {
  return {
    color: interpolateRgb(from.color, to.color, progress),
    position:
      from.position !== undefined && to.position !== undefined
        ? lerp(from.position, to.position, progress)
        : undefined,
  };
}

/**
 * Interpolate between two gradients
 */
export function interpolateGradient(
  from: GradientValue,
  to: GradientValue,
  progress: number,
): GradientValue {
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
