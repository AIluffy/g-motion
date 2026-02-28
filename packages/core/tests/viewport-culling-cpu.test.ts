import { beforeEach, describe, expect, test } from 'vitest';
import {
  __resetCullingPassForTests,
  collectViewportCullingCPUInputs,
  ENTITY_BOUNDS_STRIDE,
  RENDER_STATE_EX_STRIDE,
} from '@g-motion/webgpu';

describe('Viewport culling CPU inputs', () => {
  beforeEach(() => {
    __resetCullingPassForTests();
  });

  test('collects render states and bounds from stable archetype', () => {
    const entityIds = new Int32Array([10, 11]);
    const renderBuffer = [
      {
        rendererCode: 3,
        version: 10,
        renderedVersion: 8,
        props: { __bounds: { centerX: 1, centerY: 2, centerZ: 3, radius: 4 } },
      },
      {
        rendererCode: 5,
        version: 12,
        renderedVersion: 9,
        props: { __bounds: { centerX: 5, centerY: 6, centerZ: 7, radius: 8 } },
      },
    ];
    const indices = new Map<number, number>([
      [10, 0],
      [11, 1],
    ]);
    const typedRendererCode = new Uint32Array([7, 9]);
    const typedVersion = new Uint32Array([11, 13]);
    const typedRenderedVersion = new Uint32Array([6, 4]);
    const archetype = {
      id: 'arch',
      getBuffer: () => renderBuffer,
      getInternalEntityIndices: () => indices,
      getTypedBuffer: (_name: string, field: string) => {
        if (field === 'rendererCode') return typedRendererCode;
        if (field === 'version') return typedVersion;
        if (field === 'renderedVersion') return typedRenderedVersion;
        return undefined;
      },
    };
    const world = {
      getEntityArchetype: () => archetype,
    };
    const batch = {
      archetypeId: 'arch',
      entityIds,
      entityCount: 2,
      statesData: new Float32Array([0, 0.25, 0, 0, 0, 0.5, 0, 0]),
    };

    const result = collectViewportCullingCPUInputs({
      world,
      archetypeId: 'arch',
      batch,
      rawStride: 4,
    });

    expect(result.entityCount).toBe(2);
    expect(result.renderStatesBufferSize).toBe(2 * RENDER_STATE_EX_STRIDE * 4);
    expect(result.boundsBufferSize).toBe(2 * ENTITY_BOUNDS_STRIDE * 4);
    expect(result.paramsU32[0]).toBe(4);
    const statesU32 = result.scratch.statesU32;
    const statesF32 = result.scratch.statesF32;
    expect(statesU32[0]).toBe(10);
    expect(statesU32[1]).toBe(11);
    expect(statesU32[2]).toBe(6);
    expect(statesU32[3]).toBe(1);
    expect(statesU32[4]).toBe(7);
    expect(statesF32[6]).toBeCloseTo(0.25);
    const base1 = RENDER_STATE_EX_STRIDE;
    expect(statesU32[base1 + 0]).toBe(11);
    expect(statesU32[base1 + 1]).toBe(13);
    expect(statesU32[base1 + 2]).toBe(4);
    expect(statesU32[base1 + 3]).toBe(1);
    expect(statesU32[base1 + 4]).toBe(9);
    expect(statesF32[base1 + 6]).toBeCloseTo(0.5);
    const bounds = result.scratch.boundsF32;
    expect(bounds[0]).toBe(1);
    expect(bounds[1]).toBe(2);
    expect(bounds[2]).toBe(3);
    expect(bounds[3]).toBe(4);
    const bounds1 = ENTITY_BOUNDS_STRIDE;
    expect(bounds[bounds1 + 0]).toBe(5);
    expect(bounds[bounds1 + 1]).toBe(6);
    expect(bounds[bounds1 + 2]).toBe(7);
    expect(bounds[bounds1 + 3]).toBe(8);
  });
});
