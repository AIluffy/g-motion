/**
 * Viewport Culling Types
 */

import {
  ENTITY_BOUNDS_STRIDE,
  FRUSTUM_PLANES_FLOATS,
  RENDER_STATE_EX_STRIDE,
} from '../../culling-shader';
import type { ViewportCullingBatchDescriptor } from '@g-motion/shared';
import { resolveViewportBounds } from './viewport-bounds';
import { getNowMs } from '@g-motion/shared';

export { ENTITY_BOUNDS_STRIDE, FRUSTUM_PLANES_FLOATS, RENDER_STATE_EX_STRIDE };

export type Scratch = {
  capacity: number;
  statesAB: ArrayBuffer;
  statesU32: Uint32Array;
  statesF32: Float32Array;
  boundsF32: Float32Array;
};

export type ViewportCullingCPUInputs = {
  entityCount: number;
  renderStatesBufferSize: number;
  boundsBufferSize: number;
  scratch: Scratch;
  frustumF32: Float32Array;
  paramsU32: Uint32Array;
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

export function updateFrustumBuffer(frustumF32: Float32Array, w: number, h: number): void {
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

export function collectViewportCullingCPUInputs(params: {
  world: any;
  archetypeId: string;
  batch: ViewportCullingBatchDescriptor;
  rawStride: number;
}): ViewportCullingCPUInputs {
  const { world, archetypeId, batch, rawStride } = params;
  const now = getNowMs();
  const entityCount = batch.entityCount;
  const renderStatesBufferSize = entityCount * RENDER_STATE_EX_STRIDE * 4;
  const boundsBufferSize = entityCount * ENTITY_BOUNDS_STRIDE * 4;

  const scratch = getScratch(archetypeId, entityCount);
  const statesU32 = scratch.statesU32;
  const statesF32 = scratch.statesF32;
  const boundsF32 = scratch.boundsF32;

  const firstId = (batch.entityIds as any)[0] as number | undefined;
  const packetArchetype = firstId != null ? world.getEntityArchetype?.(firstId) : undefined;
  const stableArchetype =
    packetArchetype && packetArchetype.id === archetypeId ? packetArchetype : undefined;

  const stableRenderBuffer = stableArchetype ? stableArchetype.getBuffer?.('Render') : undefined;
  const stableIndices = stableArchetype
    ? (stableArchetype as any).getInternalEntityIndices?.()
    : undefined;
  const stableTypedRendererCode = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'rendererCode')
    : undefined;
  const stableTypedVersion = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'version')
    : undefined;
  const stableTypedRenderedVersion = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'renderedVersion')
    : undefined;

  for (let i = 0; i < entityCount; i++) {
    const id = (batch.entityIds as any)[i] as number;
    const a = stableArchetype ?? world.getEntityArchetype?.(id);
    let rendererCode = 0;
    let version = 0;
    let renderedVersion = -1;
    let bounds: any = null;

    if (a && typeof (a as any).getBuffer === 'function') {
      const renderBuffer = stableArchetype ? stableRenderBuffer : a.getBuffer?.('Render');
      const indices = stableArchetype ? stableIndices : (a as any).getInternalEntityIndices?.();
      const index = indices ? indices.get(id) : undefined;
      if (renderBuffer && index !== undefined) {
        const render = renderBuffer[index] as any;
        const typed = stableArchetype
          ? stableTypedRendererCode
          : a.getTypedBuffer?.('Render', 'rendererCode');
        rendererCode = typed ? typed[index] : (render?.rendererCode ?? 0);
        const typedV = stableArchetype
          ? stableTypedVersion
          : a.getTypedBuffer?.('Render', 'version');
        const typedRV = stableArchetype
          ? stableTypedRenderedVersion
          : a.getTypedBuffer?.('Render', 'renderedVersion');
        version = typedV ? typedV[index] : (render?.version ?? 0);
        renderedVersion = typedRV ? typedRV[index] : (render?.renderedVersion ?? -1);
        const b = render?.props?.__bounds as any;
        if (
          b &&
          typeof b.centerX === 'number' &&
          typeof b.centerY === 'number' &&
          typeof b.radius === 'number'
        ) {
          bounds = b;
        } else {
          bounds = resolveViewportBounds(render?.target, now);
        }
      }
    } else if (a && typeof (a as any).getEntityData === 'function') {
      const render = (a as any).getEntityData(id, 'Render');
      if (render) {
        rendererCode = render.rendererCode ?? 0;
        version = render.version ?? 0;
        renderedVersion = render.renderedVersion ?? -1;
        const b = render?.props?.__bounds as any;
        if (
          b &&
          typeof b.centerX === 'number' &&
          typeof b.centerY === 'number' &&
          typeof b.radius === 'number'
        ) {
          bounds = b;
        } else {
          bounds = resolveViewportBounds(render?.target, now);
        }
      }
    }

    const base = i * RENDER_STATE_EX_STRIDE;
    statesU32[base + 0] = id >>> 0;
    statesU32[base + 1] = version >>> 0;
    statesU32[base + 2] = renderedVersion >>> 0;
    statesU32[base + 3] = 1;
    statesU32[base + 4] = rendererCode >>> 0;
    statesF32[base + 5] = 0;
    statesF32[base + 6] = batch.statesData[i * 4 + 1] ?? 0;
    statesU32[base + 7] = 0;

    const bb = i * ENTITY_BOUNDS_STRIDE;
    if (bounds) {
      boundsF32[bb + 0] = bounds.centerX;
      boundsF32[bb + 1] = bounds.centerY;
      boundsF32[bb + 2] = bounds.centerZ ?? 0;
      boundsF32[bb + 3] = bounds.radius;
    } else {
      boundsF32[bb + 0] = 0;
      boundsF32[bb + 1] = 0;
      boundsF32[bb + 2] = 0;
      boundsF32[bb + 3] = 0;
    }
  }

  const frustumF32 = getFrustumBuffer();
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
  updateFrustumBuffer(frustumF32, viewportW, viewportH);
  resetParamsBuffer(rawStride);

  return {
    entityCount,
    renderStatesBufferSize,
    boundsBufferSize,
    scratch,
    frustumF32,
    paramsU32: CACHED_PARAMS_U32,
  };
}
