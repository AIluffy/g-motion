import { describe, expect, it } from 'vitest';
import { Archetype } from '../src/ecs/archetype';
import { ComputeBenchmark } from '../../benchmark/src/compute-benchmark';

function createArchetype(count: number): Archetype {
  const archetype = new Archetype(
    'bench',
    new Map([
      [
        'MotionState',
        {
          schema: {
            currentTime: 'float32',
          },
        },
      ],
    ]),
  );

  for (let i = 0; i < count; i++) {
    archetype.addEntity(i + 1, {
      MotionState: {
        currentTime: 0,
      },
    });
  }

  return archetype;
}

describe('Archetype.setField performance', () => {
  it('setField overhead stays within 5% against direct dual-write baseline', async () => {
    const entityCount = 20000;
    const passes = 5;

    const benchmark = new ComputeBenchmark();
    const baselineArchetype = createArchetype(entityCount);
    const setFieldArchetype = createArchetype(entityCount);

    const baselineResult = await benchmark.benchmark(
      'setField-baseline',
      async () => {
        const stateBuffer = baselineArchetype.getBuffer('MotionState');
        const typedBuffer = baselineArchetype.getTypedBuffer('MotionState', 'currentTime');
        if (!stateBuffer || !typedBuffer) {
          throw new Error('benchmark buffers missing');
        }

        for (let p = 0; p < passes; p++) {
          for (let i = 0; i < entityCount; i++) {
            const base = (i + 1) * 0.25 + p;
            const value = (Math.sin(base) + Math.cos(base * 0.5)) * 16;
            typedBuffer[i] = value;
            (stateBuffer[i] as Record<string, number>).currentTime = value;
          }
        }
      },
      { iterations: 12 },
    );

    const setFieldResult = await benchmark.benchmark(
      'setField-proxy',
      async () => {
        for (let p = 0; p < passes; p++) {
          for (let i = 0; i < entityCount; i++) {
            const base = (i + 1) * 0.25 + p;
            const value = (Math.sin(base) + Math.cos(base * 0.5)) * 16;
            setFieldArchetype.setField('MotionState', 'currentTime', i, value);
          }
        }
      },
      { iterations: 12 },
    );

    const ratio = setFieldResult.avgTime / baselineResult.avgTime;
    expect(ratio).toBeLessThan(1.05);
  });
});
