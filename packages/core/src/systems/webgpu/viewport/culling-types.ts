/**
 * Viewport Culling Types
 */

import {
  ENTITY_BOUNDS_STRIDE,
  FRUSTUM_PLANES_FLOATS,
  RENDER_STATE_EX_STRIDE,
} from '../../../webgpu/culling-shader';

export { ENTITY_BOUNDS_STRIDE, FRUSTUM_PLANES_FLOATS, RENDER_STATE_EX_STRIDE };

export type Scratch = {
  capacity: number;
  statesAB: ArrayBuffer;
  statesU32: Uint32Array;
  statesF32: Float32Array;
  boundsF32: Float32Array;
};

export const SCRATCH_CACHE = new Map<string, Scratch>();
export let CACHED_FRUSTUM_F32: Float32Array | null = null;
export const CACHED_PARAMS_U32 = new Uint32Array(4);

export function __resetCullingPassForTests(): void {
  SCRATCH_CACHE.clear();
  CACHED_FRUSTUM_F32 = null;
}

export function nextCapacity(current: number, needed: number): number {
  let cap = Math.max(1, current | 0);
  while (cap < needed) cap = cap * 2;
  return cap;
}

export function getScratch(archetypeId: string, entityCount: number): Scratch {
  const needed = Math.max(1, entityCount | 0);
  const existing = SCRATCH_CACHE.get(archetypeId);
  if (existing && existing.capacity >= needed) return existing;

  const capacity = nextCapacity(existing?.capacity ?? 0, needed);
  const statesAB = new ArrayBuffer(capacity * RENDER_STATE_EX_STRIDE * 4);
  const boundsF32 = new Float32Array(capacity * ENTITY_BOUNDS_STRIDE);
  const scratch: Scratch = {
    capacity,
    statesAB,
    statesU32: new Uint32Array(statesAB),
    statesF32: new Float32Array(statesAB),
    boundsF32,
  };
  SCRATCH_CACHE.set(archetypeId, scratch);
  return scratch;
}

export function getFrustumBuffer(): Float32Array {
  if (!CACHED_FRUSTUM_F32) {
    CACHED_FRUSTUM_F32 = new Float32Array(FRUSTUM_PLANES_FLOATS);
  }
  return CACHED_FRUSTUM_F32;
}

export function updateFrustumBuffer(frustumF32: Float32Array): void {
  const w = typeof (globalThis as any).innerWidth === 'number' ? (globalThis as any).innerWidth : 0;
  const h =
    typeof (globalThis as any).innerHeight === 'number' ? (globalThis as any).innerHeight : 0;
  frustumF32.set(
    [1, 0, 0, 0, -1, 0, 0, w, 0, 1, 0, 0, 0, -1, 0, h, 0, 0, 1, 1e9, 0, 0, -1, 1e9],
    0,
  );
}

export function resetParamsBuffer(rawStride: number): void {
  CACHED_PARAMS_U32[0] = Math.max(1, rawStride | 0) >>> 0;
  CACHED_PARAMS_U32[1] = 0;
  CACHED_PARAMS_U32[2] = 0;
  CACHED_PARAMS_U32[3] = 0;
}
