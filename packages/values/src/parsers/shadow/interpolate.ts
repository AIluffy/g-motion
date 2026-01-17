/**
 * Shadow Interpolation
 *
 * Functions for interpolating between shadow values.
 *
 * @module values/parsers/shadow/interpolate
 */

import type { ShadowValue } from './types';

// Default transparent color for normalization
const TRANSPARENT_COLOR = { r: 0, g: 0, b: 0, a: 0 };

/**
 * Interpolate between two shadow values
 */
export function interpolateSingleShadow(
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
