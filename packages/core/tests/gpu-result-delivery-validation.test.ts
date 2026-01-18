import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { AppContext } from '../src/context';
import { enqueueGPUResults } from '../src/webgpu/sync-manager';
import { GPUResultApplySystem } from '../src/systems/webgpu/delivery/delivery-system';

describe('GPUResultApplySystem validation', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    AppContext.reset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    AppContext.reset();
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
        errorHandler: AppContext.getInstance().getErrorHandler(),
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
        errorHandler: AppContext.getInstance().getErrorHandler(),
      },
    } as any);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Motion][ErrorHandler]'),
      expect.stringContaining('GPU result packet uses stride=1'),
      expect.objectContaining({
        archetypeId: 'TestArchetype::dom',
        stride: 1,
        channelCount: 2,
      }),
    );
  });
});
