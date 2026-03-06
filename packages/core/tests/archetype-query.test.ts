import { describe, expect, it } from 'vitest';
import { World } from '../src/runtime/world';
import type { ComponentType } from '../src/runtime/plugin';

function registerComponent(world: World, name: string): void {
  world.registry.register(name, { schema: { value: 'float32' as ComponentType } });
}

describe('ArchetypeManager.query', () => {
  it('returns matching archetype subset for required components', () => {
    const world = new World();
    registerComponent(world, 'A');
    registerComponent(world, 'B');
    registerComponent(world, 'C');

    const ab = world.getArchetype(['A', 'B']);
    world.getArchetype(['A', 'C']);
    world.getArchetype(['B', 'C']);

    const result = world.query(['A', 'B']);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(ab);
  });

  it('returns cached query result when cache is clean', () => {
    const world = new World();
    registerComponent(world, 'A');
    registerComponent(world, 'B');

    world.getArchetype(['A', 'B']);

    const first = world.query(['A', 'B']);
    const second = world.query(['B', 'A']);

    expect(second).toBe(first);
  });

  it('query average runtime stays below 0.1ms with 100 archetypes', () => {
    const world = new World();
    registerComponent(world, 'Base');

    for (let i = 0; i < 100; i++) {
      const dynamic = `C_${i}`;
      registerComponent(world, dynamic);
      world.getArchetype(['Base', dynamic], `Base|${dynamic}::${i}`);
    }

    world.query(['Base']);

    const rounds = 1000;
    const start = performance.now();
    for (let i = 0; i < rounds; i++) {
      world.query(['Base']);
    }
    const durationMs = performance.now() - start;
    const averageMs = durationMs / rounds;

    expect(averageMs).toBeLessThan(0.1);
  });
});
