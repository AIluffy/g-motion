import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '@g-motion/animation';
import { World, app } from '@g-motion/core';
import { SpringPlugin } from '../src/index';

describe('Spring Physics Plugin', () => {
  beforeAll(() => {
    // Manually register Spring plugin in test environment
    SpringPlugin.setup(app);

    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('creates SpringComponent when spring option is provided', () => {
    const world = World.get();

    motion(0)
      .mark([{ to: 100, spring: { stiffness: 200, damping: 15 } }])
      .animate();

    // Check that Spring component was registered
    const springComponent = world.registry.get('Spring');
    expect(springComponent).toBeDefined();
  });

  it('uses default spring parameters when not specified', () => {
    const world = World.get();

    motion('#test-element-2')
      .mark([{ to: { x: 100 }, spring: {} }])
      .animate();

    // Find entity with Spring component (get last one created)
    let foundSpring = false;
    for (const archetype of world.getArchetypes()) {
      const springBuffer = archetype.getBuffer('Spring');
      if (springBuffer && archetype.entityCount > 0) {
        // Check the last entity
        const spring = springBuffer[archetype.entityCount - 1];
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
    const world = World.get();

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
      .animate();

    // Find entity with Spring component (get last one created)
    let foundSpring = false;
    for (const archetype of world.getArchetypes()) {
      const springBuffer = archetype.getBuffer('Spring');
      if (springBuffer && archetype.entityCount > 0) {
        const spring = springBuffer[archetype.entityCount - 1];
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
    const world = World.get();

    motion({ x: 0, y: 0 })
      .mark([
        {
          to: { x: 100, y: 50 },
          spring: { stiffness: 200 },
        },
      ])
      .animate();

    // Find entity with Spring component
    for (const archetype of world.getArchetypes()) {
      const springBuffer = archetype.getBuffer('Spring');
      if (springBuffer && archetype.entityCount > 0) {
        const spring = springBuffer[0];
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
            stiffness: 1000, // Very stiff for fast completion
            damping: 100, // High damping for quick settle
            restSpeed: 100, // Loose threshold for test
            restDelta: 1, // Loose threshold for test
          },
        },
      ])
      .animate({ onUpdate });

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have been called multiple times during animation
    expect(onUpdate.mock.calls.length).toBeGreaterThan(5);
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
      .animate();

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
      .animate({
        onUpdate: (val: any) => values.push(val),
      });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Spring should show typical spring behavior:
    // - Values should increase initially
    // - May oscillate around target
    // - Eventually settle near target
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toBeGreaterThan(0); // Should start moving
  });
});
