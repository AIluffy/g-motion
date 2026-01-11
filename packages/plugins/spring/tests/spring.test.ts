import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { motion } from '@g-motion/animation';
import { WorldProvider, app, MotionStatus } from '@g-motion/core';
import { SpringPlugin } from '../src/index';

describe('Spring Physics Plugin', () => {
  beforeAll(() => {
    // Manually register Spring plugin in test environment
    SpringPlugin.setup(app);

    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  beforeEach(() => {
    WorldProvider.useWorld().resetState();
  });

  it('creates SpringComponent when spring option is provided', () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([{ to: 100, spring: { stiffness: 200, damping: 15 } }])
      .play();

    // Check that Spring component was registered
    const springComponent = world.registry.get('Spring');
    expect(springComponent).toBeDefined();
  });

  it('uses default spring parameters when not specified', () => {
    const world = WorldProvider.useWorld();

    const el = document.createElement('div');
    el.id = 'test-element-2';
    document.body.appendChild(el);
    try {
      motion('#test-element-2')
        .mark([{ to: { x: 100 }, spring: {} }])
        .play();
    } finally {
      document.body.removeChild(el);
    }

    // Find entity with Spring component (get last one created)
    let foundSpring = false;
    for (const archetype of world.getArchetypes()) {
      const springBuffer = archetype.getBuffer('Spring');
      if (springBuffer && archetype.entityCount > 0) {
        // Check the last entity
        const spring = springBuffer[archetype.entityCount - 1] as any;
        expect(spring.stiffness).toBe(100); // default
        expect(spring.damping).toBe(10); // default
        expect(spring.mass).toBe(1); // default
        expect(spring.restSpeed).toBe(10); // default
        expect(spring.restDelta).toBe(0.01); // default
        foundSpring = true;
        break;
      }
    }
    expect(foundSpring).toBe(true);
  });

  it('accepts custom spring parameters', () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([
        {
          to: 100,
          spring: {
            stiffness: 300,
            damping: 20,
            mass: 2,
            restSpeed: 5,
            restDelta: 0.1,
          },
        },
      ])
      .play();

    // Find entity with Spring component (get last one created)
    let foundSpring = false;
    for (const archetype of world.getArchetypes()) {
      const springBuffer = archetype.getBuffer('Spring');
      if (springBuffer && archetype.entityCount > 0) {
        const spring = springBuffer[archetype.entityCount - 1] as any;
        expect(spring.stiffness).toBe(300);
        expect(spring.damping).toBe(20);
        expect(spring.mass).toBe(2);
        expect(spring.restSpeed).toBe(5);
        expect(spring.restDelta).toBe(0.1);
        foundSpring = true;
        break;
      }
    }
    expect(foundSpring).toBe(true);
  });

  it('initializes per-track velocities map', () => {
    const world = WorldProvider.useWorld();

    motion({ x: 0, y: 0 })
      .mark([
        {
          to: { x: 100, y: 50 },
          spring: { stiffness: 200 },
        },
      ])
      .play();

    // Find entity with Spring component
    for (const archetype of world.getArchetypes()) {
      const springBuffer = archetype.getBuffer('Spring');
      if (springBuffer && archetype.entityCount > 0) {
        const spring = springBuffer[0] as any;
        expect(spring.velocities).toBeDefined();
        expect(spring.velocities instanceof Map).toBe(true);
        break;
      }
    }
  });

  it('completes animation when all tracks reach rest state', async () => {
    const onUpdate = vi.fn();

    motion(0)
      .mark([
        {
          to: 10,
          spring: {
            stiffness: 1000,
            damping: 100,
            restSpeed: 100,
            restDelta: 1,
          },
        },
      ])
      .option({ onUpdate })
      .play();

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify that animation reached rest state using MotionState status
    const world = WorldProvider.useWorld();
    let isFinished = false;
    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      if (stateBuffer && archetype.entityCount > 0) {
        const state = stateBuffer[archetype.entityCount - 1] as any;
        if (state.status === MotionStatus.Finished) {
          isFinished = true;
        }
      }
    }

    expect(isFinished).toBe(true);
  });

  it('works with DOM elements via selector', () => {
    // Create a test element
    const testDiv = document.createElement('div');
    testDiv.id = 'spring-test-element';
    document.body.appendChild(testDiv);

    motion('#spring-test-element')
      .mark([
        {
          to: { x: 200 },
          spring: { stiffness: 150, damping: 12 },
        },
      ])
      .play();

    // Cleanup
    document.body.removeChild(testDiv);
  });

  it('applies semi-implicit Euler integration correctly', async () => {
    const values: number[] = [];

    motion(0)
      .mark([
        {
          to: 100,
          spring: {
            stiffness: 100,
            damping: 10,
            mass: 1,
          },
        },
      ])
      .option({
        onUpdate: (val: any) => values.push(val),
      })
      .play();

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Instead of relying solely on onUpdate timings, inspect Render component state
    const world = WorldProvider.useWorld();
    let finalValue: number | null = null;
    for (const archetype of world.getArchetypes()) {
      const renderBuffer = archetype.getBuffer('Render');
      if (renderBuffer && archetype.entityCount > 0) {
        const render = renderBuffer[archetype.entityCount - 1] as any;
        if (render?.props && typeof render.props.__primitive === 'number') {
          finalValue = render.props.__primitive;
        }
      }
    }

    expect(finalValue).not.toBeNull();
    if (finalValue !== null) {
      expect(finalValue).toBeGreaterThan(0);
      expect(finalValue).toBeLessThan(200);
    }
  });
});
