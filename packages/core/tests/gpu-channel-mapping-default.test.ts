import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GPUResultApplySystem } from '../src/systems/webgpu/delivery';
import { getGPUChannelMappingRegistry } from '../src/webgpu/channel-mapping';
import { enqueueGPUResults } from '../src/webgpu/sync-manager';

function createWorldStub() {
  const entities = new Map<number, any>();
  return {
    getEntityArchetype(id: number) {
      if (!entities.has(id)) {
        entities.set(id, {
          getEntityData(_: number, name: string) {
            if (name !== 'Render') return undefined;
            let render = (this as any)._render;
            if (!render) {
              render = { rendererId: 'object', props: {} as Record<string, number> };
              (this as any)._render = render;
            }
            return render;
          },
        });
      }
      return entities.get(id);
    },
    _getRender(id: number) {
      const arch = entities.get(id);
      return arch ? arch.getEntityData(id, 'Render') : undefined;
    },
  };
}

describe('GPUResultApplySystem default channel mapping', () => {
  let originalEnv: string | undefined;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getGPUChannelMappingRegistry().clear();
  });

  it('uses default mapping with warning in dev when no mapping is registered', () => {
    process.env.NODE_ENV = 'development';
    const world = createWorldStub();
    const values = new Float32Array([10, 20, 30, 40, 50]);

    enqueueGPUResults({
      archetypeId: 'MotionState|Render|Timeline',
      entityIds: [1],
      values,
      stride: 5,
    });

    GPUResultApplySystem.update(0, { services: { world } } as any);

    const render = (world as any)._getRender(1);
    expect(render).toBeDefined();
    if (!render) return;
    expect(render.props.x).toBe(10);
    expect(render.props.y).toBe(20);
    expect(consoleWarnSpy).toHaveBeenCalled();
    process.env.NODE_ENV = originalEnv;
  });
});
