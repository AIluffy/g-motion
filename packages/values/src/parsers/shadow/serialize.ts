/**
 * Shadow Serialization
 *
 * Functions for serializing shadow values back to CSS strings.
 *
 * @module values/parsers/shadow/serialize
 */

import type { ShadowValue } from './types';

/**
 * Serialize a single shadow to string
 */
export function serializeSingleShadow(shadow: ShadowValue, isTextShadow: boolean = false): string {
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
