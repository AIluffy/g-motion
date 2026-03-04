/**
 * Archetype helper utilities
 *
 * Reusable functions for common archetype operations to reduce code duplication
 */

import {
  TRANSFORM_TYPED_KEYS,
  buildTransformTypedBuffers,
  type TransformTypedBuffers,
} from '@g-motion/shared';
import { Archetype } from '../ecs/archetype';

/**
 * Transform component field names
 */
export const TRANSFORM_FIELDS = TRANSFORM_TYPED_KEYS;

/**
 * Extract all typed buffers for Transform component fields
 *
 * This eliminates code duplication across multiple systems that need
 * to access Transform typed buffers (RenderSystem, etc.)
 *
 * @param archetype - The archetype to extract buffers from
 * @returns Record of field names to their typed buffers (undefined if not available)
 *
 * @example
 * ```ts
 * const typedBuffers = extractTransformTypedBuffers(archetype);
 * const xValue = typedBuffers.x?.[entityIndex] ?? 0;
 * ```
 */
export function extractTransformTypedBuffers(archetype: Archetype): TransformTypedBuffers {
  return buildTransformTypedBuffers(
    (component, field) => archetype.getTypedBuffer(component, field),
    TRANSFORM_FIELDS,
  );
}

/**
 * Extract commonly used component buffers
 *
 * @param archetype - The archetype to extract buffers from
 * @returns Object containing common buffer references
 */
export function extractCommonBuffers(archetype: Archetype) {
  return {
    stateBuffer: archetype.getBuffer('MotionState'),
    timelineBuffer: archetype.getBuffer('Timeline'),
    renderBuffer: archetype.getBuffer('Render'),
    transformBuffer: archetype.getBuffer('Transform'),
    springBuffer: archetype.getBuffer('Spring'),
    inertiaBuffer: archetype.getBuffer('Inertia'),
  };
}
