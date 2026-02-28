/**
 * Shadow Types and Interfaces
 *
 * Type definitions for shadow values.
 *
 * @module values/parsers/shadow/types
 */

import type { ColorValue } from '../color';

/**
 * Single shadow value representation
 */
export interface ShadowValue {
  /** Horizontal offset in pixels */
  offsetX: number;
  /** Vertical offset in pixels */
  offsetY: number;
  /** Blur radius in pixels */
  blur: number;
  /** Spread radius in pixels (box-shadow only) */
  spread?: number;
  /** Shadow color */
  color: ColorValue;
  /** Whether the shadow is inset (box-shadow only) */
  inset?: boolean;
}

/**
 * Multiple shadows value representation
 */
export interface ShadowsValue {
  /** Array of individual shadows */
  shadows: ShadowValue[];
  /** Whether this is a text-shadow (no spread/inset) */
  isTextShadow?: boolean;
}
