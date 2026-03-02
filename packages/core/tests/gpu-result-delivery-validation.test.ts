import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { AppContext } from '../src/context';
import { enqueueGPUResults } from '@g-motion/webgpu/internal';
import { GPUResultApplySystem } from '../src/systems/webgpu/delivery/delivery-system';
import { applyGPUResultPacket } from '../src/systems/webgpu/delivery/apply-results';
import type { ChannelMapping } from '@g-motion/webgpu/internal';

describe('GPUResultApplySystem validation', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    AppContext.reset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    AppContext.reset();
    process.env.NODE_ENV = originalEnv;
  });

  test('does not warn for stride=1 with a single mapped channel', () => {
    enqueueGPUResults({
      archetypeId: 'TestArchetype::dom',
      entityIds: [1],
      values: new Float32Array([0.5]),
      stride: 1,
      channels: [{ index: 0, property: 'opacity' }],
    });

    GPUResultApplySystem.update(0, {
      services: {
        world: { getEntityArchetype: () => undefined } as any,
      },
    } as any);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  test('warns for stride=1 with multi-channel mapping', () => {
    enqueueGPUResults({
      archetypeId: 'TestArchetype::dom',
      entityIds: [1],
      values: new Float32Array([0.5]),
      stride: 1,
      channels: [
        { index: 0, property: 'x' },
        { index: 1, property: 'y' },
      ],
    });

    GPUResultApplySystem.update(0, {
      services: {
        world: { getEntityArchetype: () => undefined } as any,
      },
    } as any);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Motion][GPUResultApplySystem]'),
      expect.stringContaining('GPU result packet uses stride=1'),
      expect.objectContaining({
        archetypeId: 'TestArchetype::dom',
        stride: 1,
        channelCount: 2,
      }),
    );
  });

  test('applies consistent render props across result paths', () => {
    const channelsResolved: ChannelMapping[] = [
      { index: 0, property: 'opacity' },
      { index: 1, property: 'translateX' },
    ];
    const packet = {
      archetypeId: 'arch',
      entityIds: new Int32Array([1]),
      values: new Float32Array([0.5, 10]),
    };
    const renderStable = {
      rendererId: 'dom',
      rendererCode: 0,
      props: {} as Record<string, number>,
      version: 0,
    };
    const renderFallback = {
      rendererId: 'dom',
      rendererCode: 0,
      props: {} as Record<string, number>,
      version: 0,
    };
    const transformBuffer = [{ translateX: 0, x: 0 }];
    const indices = new Map<number, number>([[1, 0]]);
    const typedRendererCode = new Int32Array([0]);
    const typedTransformX = new Float32Array([0]);
    const typedTransformTranslateX = new Float32Array([0]);

    const stableArchetype = {
      id: 'arch',
      getBuffer: (name: string) => {
        if (name === 'Render') return [renderStable];
        if (name === 'Transform') return transformBuffer;
        return undefined;
      },
      getInternalEntityIndices: () => indices,
      getTypedBuffer: (component: string, field: string) => {
        if (component === 'Render' && field === 'rendererCode') return typedRendererCode;
        if (component === 'Transform' && field === 'x') return typedTransformX;
        if (component === 'Transform' && field === 'translateX') return typedTransformTranslateX;
        return undefined;
      },
    };

    const fallbackArchetype = {
      id: 'other',
      getEntityData: (entityId: number, componentName: string) => {
        if (entityId === 1 && componentName === 'Render') return renderFallback;
        return undefined;
      },
    };

    const worldStable = { getEntityArchetype: () => stableArchetype };
    const worldFallback = { getEntityArchetype: () => fallbackArchetype };

    applyGPUResultPacket({
      world: worldStable as any,
      packet: packet as any,
      channelsResolved,
      stride: 2,
      primitiveCode: -1,
    });
    applyGPUResultPacket({
      world: worldFallback as any,
      packet: packet as any,
      channelsResolved,
      stride: 2,
      primitiveCode: -1,
    });

    expect(renderStable.props).toEqual(renderFallback.props);
    expect(renderStable.version).toBe(renderFallback.version);
    expect(renderStable.props.opacity).toBe(0.5);
    expect(renderStable.props.translateX).toBe(10);
  });
});
