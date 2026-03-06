import { describe, expect, it } from 'vitest';
import { ComponentRegistry } from '../src/ecs/registry';
import { App } from '../src/runtime/app';
import { World } from '../src/runtime/world';

describe('ComponentRegistry.register', () => {
  it('returns same id when registering same name and equivalent schema', () => {
    const registry = new ComponentRegistry();

    const id1 = registry.register('Transform', {
      schema: { x: 'float32', y: 'float32' },
    });
    const id2 = registry.register('Transform', {
      schema: { y: 'float32', x: 'float32' },
    });

    expect(id2).toBe(id1);
  });

  it('throws with schema diff details when schema differs for same component name', () => {
    const registry = new ComponentRegistry();

    registry.register('Transform', {
      schema: { x: 'float32', y: 'float32' },
    });

    expect(() => {
      registry.register('Transform', {
        schema: { x: 'float32', y: 'float64' },
      });
    }).toThrowError(
      '[g-motion] Component "Transform" is already registered with a different schema.',
    );

    expect(() => {
      registry.register('Transform', {
        schema: { x: 'float32', y: 'float64' },
      });
    }).toThrowError(/Existing: \{"x":"float32","y":"float32"\}/);

    expect(() => {
      registry.register('Transform', {
        schema: { x: 'float32', y: 'float64' },
      });
    }).toThrowError(/Incoming: \{"x":"float32","y":"float64"\}/);
  });
});

describe('App.registerComponent', () => {
  it('is idempotent for same schema and throws for different schema', () => {
    const world = new World();
    const app = new App(world);

    app.registerComponent('Transform', { schema: { x: 'float32', y: 'float32' } });
    const firstId = world.registry.getId('Transform');

    expect(() => {
      app.registerComponent('Transform', { schema: { y: 'float32', x: 'float32' } });
    }).not.toThrow();

    expect(world.registry.getId('Transform')).toBe(firstId);

    expect(() => {
      app.registerComponent('Transform', { schema: { x: 'float32', y: 'float64' } });
    }).toThrowError(/different schema/);
  });
});
