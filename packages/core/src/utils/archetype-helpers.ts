/**
 * Archetype helper utilities
 *
 * Reusable functions for common archetype operations to reduce code duplication
 */

import { Archetype } from '../archetype';

/**
 * Transform component field names
 */
export const TRANSFORM_FIELDS = [
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'perspective',
] as const;

/**
 * Extract all typed buffers for Transform component fields
 *
 * This eliminates code duplication across multiple systems that need
 * to access Transform typed buffers (InterpolationSystem, RenderSystem, etc.)
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
export function extractTransformTypedBuffers(
  archetype: Archetype,
): Record<string, Float32Array | Float64Array | Int32Array | undefined> {
  const buffers: Record<string, Float32Array | Float64Array | Int32Array | undefined> = {};

  for (const field of TRANSFORM_FIELDS) {
    buffers[field] = archetype.getTypedBuffer('Transform', field);
  }

  return buffers;
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
