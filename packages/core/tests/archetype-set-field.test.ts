import { describe, expect, it, vi } from 'vitest';
import { Archetype } from '../src/ecs/archetype';

function createArchetype(): Archetype {
  return new Archetype(
    'test',
    new Map([
      [
        'MotionState',
        {
          schema: {
            currentTime: 'float32',
            name: 'string',
          },
        },
      ],
    ]),
  );
}

describe('Archetype.setField', () => {
  it('keeps typed buffer and object buffer in sync for numeric fields', () => {
    const archetype = createArchetype();
    archetype.addEntity(1, {
      MotionState: {
        currentTime: 0,
        name: 'idle',
      },
    });

    archetype.setField('MotionState', 'currentTime', 0, 42.5);

    const stateBuffer = archetype.getBuffer('MotionState');
    const currentTimeBuf = archetype.getTypedBuffer('MotionState', 'currentTime');

    expect(stateBuffer?.[0]).toMatchObject({ currentTime: 42.5 });
    expect(currentTimeBuf?.[0]).toBeCloseTo(42.5);
  });

  it('writes object buffer only for non-numeric fields and does not throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const archetype = createArchetype();
    archetype.addEntity(1, {
      MotionState: {
        currentTime: 0,
        name: 'idle',
      },
    });

    expect(() => {
      archetype.setField('MotionState', 'name', 0, 7);
    }).not.toThrow();

    const stateBuffer = archetype.getBuffer('MotionState');
    const nameTypedBuf = archetype.getTypedBuffer('MotionState', 'name');

    expect((stateBuffer?.[0] as Record<string, unknown>).name).toBe(7);
    expect(nameTypedBuf).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
