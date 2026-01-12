/**
 * Color Space Conversion Utilities
 *
 * Functions for converting between different color spaces (RGB, HSL, Hex).
 *
 * @module values/parsers/color/convert
 */

/**
 * Convert RGB to HSL color space
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns [h, s, l] where h is 0-360, s and l are 0-100
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  let red = r / 255;
  let green = g / 255;
  let blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l * 100];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let hue: number;
  switch (max) {
    case red:
      hue = ((green - blue) / d + (green < blue ? 6 : 0)) / 6;
      break;
    case green:
      hue = ((blue - red) / d + 2) / 6;
      break;
    default:
      hue = ((red - green) / d + 4) / 6;
      break;
  }

  return [hue * 360, s * 100, l * 100];
}

/**
 * Convert HSL to RGB color space
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns [r, g, b] where each is 0-255
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let hue = h / 360;
  let saturation = s / 100;
  let lightness = l / 100;

  if (saturation === 0) {
    const gray = Math.round(lightness * 255);
    return [gray, gray, gray];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return [
    Math.round(hue2rgb(p, q, hue + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hue) * 255),
    Math.round(hue2rgb(p, q, hue - 1 / 3) * 255),
  ];
}

/**
 * Convert hex color string to RGB
 * @param hex - Hex color string (#RGB, #RRGGBB, #RGBA, #RRGGBBAA)
 * @returns [r, g, b, a] where r,g,b are 0-255 and a is 0-1
 */
export function hexToRgba(hex: string): [number, number, number, number] {
  // Remove # prefix
  hex = hex.replace(/^#/, '');

  let r: number,
    g: number,
    b: number,
    a: number = 1;

  if (hex.length === 3) {
    // #RGB
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 4) {
    // #RGBA
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
    a = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 6) {
    // #RRGGBB
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (hex.length === 8) {
    // #RRGGBBAA
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`Invalid hex color: #${hex}`);
  }

  return [r, g, b, a];
}

/**
 * Convert RGB to hex color string
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @param a - Alpha (0-1), optional
 * @returns Hex color string (#RRGGBB or #RRGGBBAA)
 */
export function rgbaToHex(r: number, g: number, b: number, a?: number): string {
  const toHex = (n: number): string => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

  if (a !== undefined && a < 1) {
    return hex + toHex(Math.round(a * 255));
  }

  return hex;
}

// Legacy aliases for compatibility
export const hexToRgb = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgba(hex);
  return [r, g, b];
};

export const rgbToHex = (r: number, g: number, b: number): string => rgbaToHex(r, g, b);
