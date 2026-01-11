/**
 * Color Interpolation
 *
 * Functions for interpolating between color values in different color spaces.
 *
 * @module values/parsers/color/interpolate
 */

import type { ColorValue } from './types';
import { rgbToHsl, hslToRgb } from './convert';

/**
 * Interpolate between two colors in RGB space
 */
export function interpolateRgb(from: ColorValue, to: ColorValue, progress: number): ColorValue {
  return {
    r: from.r + (to.r - from.r) * progress,
    g: from.g + (to.g - from.g) * progress,
    b: from.b + (to.b - from.b) * progress,
    a: from.a + (to.a - from.a) * progress,
  };
}

/**
 * Interpolate between two colors in HSL space
 * Uses shortest path for hue interpolation
 */
export function interpolateHsl(from: ColorValue, to: ColorValue, progress: number): ColorValue {
  const [fromH, fromS, fromL] = rgbToHsl(from.r, from.g, from.b);
  const [toH, toS, toL] = rgbToHsl(to.r, to.g, to.b);

  // Calculate shortest path for hue
  let deltaH = toH - fromH;
  if (deltaH > 180) {
    deltaH -= 360;
  } else if (deltaH < -180) {
    deltaH += 360;
  }

  const h = (((fromH + deltaH * progress) % 360) + 360) % 360;
  const s = fromS + (toS - fromS) * progress;
  const l = fromL + (toL - fromL) * progress;
  const a = from.a + (to.a - from.a) * progress;

  const [r, g, b] = hslToRgb(h, s, l);

  return { r, g, b, a };
}
