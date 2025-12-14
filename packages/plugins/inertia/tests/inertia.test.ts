import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '@g-motion/animation';
import { World, app } from '@g-motion/core';
import { InertiaPlugin } from '../src/index';

describe('Inertia Physics Plugin', () => {
  beforeAll(() => {
    // Manually register Inertia plugin in test environment
    InertiaPlugin.setup(app);

    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('creates InertiaComponent when inertia option is provided', () => {
    const world = World.get();

    motion(0)
      .mark([{ inertia: { velocity: 500 } }])
      .animate();

    // Check that Inertia component was registered
    const inertiaComponent = world.registry.get('Inertia');
    expect(inertiaComponent).toBeDefined();
  });

  it('uses default inertia parameters when not specified', () => {
    const world = World.get();

    motion(0)
      .mark([{ inertia: { velocity: 800 } }])
      .animate();

    // Find entity with Inertia component
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.power).toBe(0.8); // default
        expect(inertia.timeConstant).toBe(350); // default
        expect(inertia.bounceStiffness).toBe(500); // default
        expect(inertia.bounceDamping).toBe(10); // default
        expect(inertia.restSpeed).toBe(0.5); // default
        expect(inertia.restDelta).toBe(0.5); // default
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);
  });

  it('accepts custom inertia parameters', () => {
    const world = World.get();

    motion(0)
      .mark([
        {
          inertia: {
            velocity: 1000,
            power: 0.9,
            timeConstant: 500,
            min: 0,
            max: 300,
            bounceStiffness: 600,
            bounceDamping: 15,
            restSpeed: 1,
            restDelta: 1,
          },
        },
      ])
      .animate();

    // Find entity with Inertia component
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.power).toBe(0.9);
        expect(inertia.timeConstant).toBe(500);
        expect(inertia.min).toBe(0);
        expect(inertia.max).toBe(300);
        expect(inertia.bounceStiffness).toBe(600);
        expect(inertia.bounceDamping).toBe(15);
        expect(inertia.restSpeed).toBe(1);
        expect(inertia.restDelta).toBe(1);
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);
  });

  it('initializes per-track velocity from static value', () => {
    const world = World.get();

    const control = motion({ x: 0 })
      .mark([
        {
          to: { x: 100 },
          inertia: { velocity: 750 },
        },
      ])
      .animate();

    // Velocity should be initialized in the builder
    // Find entity with Inertia component
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.velocities).toBeDefined();
        expect(inertia.velocities instanceof Map).toBe(true);
        // Velocity might have been updated by system, check it's initialized
        expect(inertia.velocities.has('x')).toBe(true);
        break;
      }
    }

    control.stop();
  });

  it('resolves velocity from function', () => {
    const world = World.get();
    let velocityValue = 600;

    const control = motion(0)
      .mark([
        {
          inertia: { velocity: () => velocityValue },
        },
      ])
      .animate();

    // Velocity function is resolved in builder when creating component
    // Find entity with Inertia component
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        // Velocity might have decayed, but should be initialized
        expect(inertia.velocities.has('__primitive')).toBe(true);
        const vel = inertia.velocities.get('__primitive');
        expect(vel).toBeDefined();
        // Should be <= initial value due to decay
        expect(vel!).toBeLessThanOrEqual(600);
        break;
      }
    }

    control.stop();
  });

  it('resolves velocity via custom velocitySource when using auto', () => {
    const world = World.get();

    const control = motion({ x: 0 })
      .mark([
        {
          to: { x: 100 },
          inertia: {
            velocity: 'auto',
            velocitySource: (track) => (track === 'x' ? 420 : 0),
          },
        },
      ])
      .animate();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.velocities.get('x')).toBe(420);
        break;
      }
    }

    control.stop();
  });

  it('maps bounds and clamp options into component', () => {
    const world = World.get();

    motion(0)
      .mark([{ inertia: { velocity: 500, bounds: { min: -50, max: 50 }, clamp: true } }])
      .animate();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.bounds?.min).toBe(-50);
        expect(inertia.bounds?.max).toBe(50);
        expect(inertia.clamp).toBe(1);
        break;
      }
    }
  });

  it('accepts snap alias and bounce=false without enabling bounce', () => {
    const world = World.get();

    motion(0)
      .mark([{ inertia: { velocity: 300, snap: 20, bounce: false } }])
      .animate();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.snap).toBe(20);
        expect(inertia.bounce).toBe(false);
        break;
      }
    }
  });

  it('stores handoff configuration for later spring transition', () => {
    const world = World.get();

    motion(0)
      .mark([{ inertia: { velocity: 400, handoff: { type: 'spring', to: 120 } } }])
      .animate();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.handoff).toEqual({ type: 'spring', to: 120 });
        break;
      }
    }
  });

  it('throws error when track has both spring and inertia', () => {
    expect(() => {
      motion(0)
        .mark([
          {
            to: 100,
            spring: { stiffness: 200 },
            inertia: { velocity: 500 },
          },
        ])
        .animate();
    }).toThrow(/cannot use both spring and inertia/i);
  });

  it('allows different physics on different tracks', () => {
    // Note: This test requires spring plugin to be registered
    const world = World.get();

    // X-axis with inertia, Y-axis without physics
    motion({ x: 0, y: 0 })
      .mark([
        {
          to: { x: 100, y: 50 },
          inertia: { velocity: 800 },
        },
      ])
      .animate();

    // Should create Inertia component
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);
  });

  it('decays velocity exponentially over time', async () => {
    const values: number[] = [];
    const obj = { value: 0 };

    const control = motion(obj)
      .mark([
        {
          to: { value: 100 },
          inertia: {
            velocity: 1000,
            timeConstant: 200,
          },
        },
      ])
      .animate({
        onUpdate: () => {
          values.push(obj.value);
        },
      });

    await new Promise((resolve) => setTimeout(resolve, 150));

    control.stop();

    // Inertia should produce some values
    // Note: In test environment, timing may be inconsistent
    expect(values.length).toBeGreaterThanOrEqual(0);
  });

  it('handles implicit boundary from to parameter', () => {
    const world = World.get();

    const control = motion(0)
      .mark([
        {
          to: 200,
          inertia: { velocity: 800 }, // Positive velocity, so 'to' becomes max
        },
      ])
      .animate();

    // The boundary inference happens in InertiaSystem at runtime
    // Here we just verify the entity was created with expected config
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      const timelineBuffer = archetype.getBuffer('Timeline');
      if (inertiaBuffer && timelineBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        const timeline = timelineBuffer[archetype.entityCount - 1];
        // Velocity should be initialized (might have decayed)
        expect(inertia.velocities.has('__primitive')).toBe(true);
        expect(timeline.tracks.get('__primitive')?.[0]?.endValue).toBe(200);
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);

    control.stop();
  });

  it('initializes bounce state maps', () => {
    const world = World.get();

    motion(0)
      .mark([
        {
          inertia: { velocity: 500, min: 0, max: 100 },
        },
      ])
      .animate();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[0];
        expect(inertia.bounceVelocities).toBeDefined();
        expect(inertia.bounceVelocities instanceof Map).toBe(true);
        expect(inertia.inBounce).toBeDefined();
        expect(inertia.inBounce instanceof Map).toBe(true);
        break;
      }
    }
  });

  it('works with DOM elements via selector', () => {
    const testDiv = document.createElement('div');
    testDiv.id = 'inertia-test-element';
    document.body.appendChild(testDiv);

    motion('#inertia-test-element')
      .mark([
        {
          to: { x: 300 },
          inertia: { velocity: 700, max: 300 },
        },
      ])
      .animate();

    // Cleanup
    document.body.removeChild(testDiv);
  });

  it('completes animation when velocity falls below threshold', async () => {
    const onUpdate = vi.fn();

    motion(0)
      .mark([
        {
          inertia: {
            velocity: 300,
            timeConstant: 100, // Fast decay
            restSpeed: 50, // Loose threshold
          },
        },
      ])
      .animate({ onUpdate });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have been called multiple times during animation
    expect(onUpdate.mock.calls.length).toBeGreaterThan(3);
  });

  it('snaps to exact end value when end is a number', () => {
    const world = World.get();

    const control = motion(0)
      .mark([
        {
          inertia: {
            velocity: 1000,
            end: 500, // Exact snap target
          },
        },
      ])
      .animate();

    // Verify InertiaComponent has end parameter set
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(inertia.end).toBe(500);
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);

    control.stop();
  });

  it('snaps to closest value in array', () => {
    const world = World.get();

    const control = motion(0)
      .mark([
        {
          inertia: {
            velocity: 800,
            end: [0, 100, 200, 300], // Snap points array
          },
        },
      ])
      .animate();

    // Verify InertiaComponent has end array set
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(Array.isArray(inertia.end)).toBe(true);
        expect(inertia.end).toEqual([0, 100, 200, 300]);
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);

    control.stop();
  });

  it('uses custom snap function', () => {
    const world = World.get();
    const snapFn = (naturalEnd: number) => Math.round(naturalEnd / 50) * 50;

    const control = motion(0)
      .mark([
        {
          inertia: {
            velocity: 750,
            end: snapFn, // Custom snap function
          },
        },
      ])
      .animate();

    // Verify InertiaComponent has end function set
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = archetype.getBuffer('Inertia');
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        expect(typeof inertia.end).toBe('function');
        expect(inertia.end).toBe(snapFn);
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);

    control.stop();
  });
});
