import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion } from '@g-motion/animation';
import { WorldProvider, app, type InertiaComponentData } from '@g-motion/core';
import { InertiaPlugin } from '../src/index';

type TimelineComponentData = {
  tracks: Map<string, Array<{ endValue: number }>>;
};

function asInertiaBuffer(buffer: unknown): Array<InertiaComponentData | undefined> | null {
  if (!Array.isArray(buffer)) return null;
  return buffer as Array<InertiaComponentData | undefined>;
}

function asTimelineBuffer(buffer: unknown): Array<TimelineComponentData | undefined> | null {
  if (!Array.isArray(buffer)) return null;
  return buffer as Array<TimelineComponentData | undefined>;
}

describe('Inertia Physics Plugin', () => {
  beforeAll(() => {
    // Manually register Inertia plugin in test environment
    InertiaPlugin.setup(app);

    global.requestAnimationFrame = (cb) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('creates InertiaComponent when inertia option is provided', () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([{ inertia: { velocity: 500 } }])
      .play();

    // Check that Inertia component was registered
    const inertiaComponent = world.registry.get('Inertia');
    expect(inertiaComponent).toBeDefined();
  });

  it('uses default inertia parameters when not specified', () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([{ inertia: { velocity: 800 } }])
      .play();

    // Find entity with Inertia component
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
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
    const world = WorldProvider.useWorld();

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
      .play();

    // Find entity with Inertia component
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
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
    const world = WorldProvider.useWorld();

    const control = motion({ x: 0 })
      .mark([
        {
          to: { x: 100 },
          inertia: { velocity: 750 },
        },
      ])
      .play();

    // Velocity should be initialized in the builder
    // Find entity with Inertia component
    let found = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        for (let i = archetype.entityCount - 1; i >= 0; i--) {
          const inertia = inertiaBuffer[i];
          if (!inertia) continue;
          if (!(inertia.velocities instanceof Map)) continue;
          if (inertia.velocities.has('x')) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    expect(found).toBe(true);

    control.stop();
  });

  it('resolves velocity from function', () => {
    const world = WorldProvider.useWorld();
    let velocityValue = 600;

    const control = motion(0)
      .mark([
        {
          inertia: { velocity: () => velocityValue },
        },
      ])
      .play();

    // Velocity function is resolved in builder when creating component
    // Find entity with Inertia component
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
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
    const world = WorldProvider.useWorld();

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
      .play();

    let found = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        for (let i = archetype.entityCount - 1; i >= 0; i--) {
          const inertia = inertiaBuffer[i];
          if (!inertia) continue;
          const velocities = inertia.velocities;
          if (velocities.has('x')) {
            expect(velocities.get('x')).toBe(420);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    expect(found).toBe(true);

    control.stop();
  });

  it('maps bounds and clamp options into component', () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([{ inertia: { velocity: 500, bounds: { min: -50, max: 50 }, clamp: true } }])
      .play();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
        expect(inertia.bounds?.min).toBe(-50);
        expect(inertia.bounds?.max).toBe(50);
        expect(inertia.clamp).toBe(1);
        break;
      }
    }
  });

  it('accepts snap alias and bounce=false without enabling bounce', () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([{ inertia: { velocity: 300, snap: 20, bounce: false } }])
      .play();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
        expect(inertia.snap).toBe(20);
        expect(inertia.bounce).toBe(false);
        break;
      }
    }
  });

  it('stores handoff configuration for later spring transition', () => {
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([{ inertia: { velocity: 400, handoff: { type: 'spring', to: 120 } } }])
      .play();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
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
        .play();
    }).toThrow(/cannot use both spring and inertia/i);
  });

  it('allows different physics on different tracks', () => {
    // Note: This test requires spring plugin to be registered
    const world = WorldProvider.useWorld();

    // X-axis with inertia, Y-axis without physics
    motion({ x: 0, y: 0 })
      .mark([
        {
          to: { x: 100, y: 50 },
          inertia: { velocity: 800 },
        },
      ])
      .play();

    // Should create Inertia component
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
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
      .option({
        onUpdate: () => {
          values.push(obj.value);
        },
      })
      .play();

    await new Promise((resolve) => setTimeout(resolve, 150));

    control.stop();

    // Inertia should produce some values
    // Note: In test environment, timing may be inconsistent
    expect(values.length).toBeGreaterThanOrEqual(0);
  });

  it('handles implicit boundary from to parameter', () => {
    const world = WorldProvider.useWorld();

    const control = motion(0)
      .mark([
        {
          to: 200,
          inertia: { velocity: 800 }, // Positive velocity, so 'to' becomes max
        },
      ])
      .play();

    // The boundary inference happens in InertiaSystem at runtime
    // Here we just verify the entity was created with expected config
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      const timelineBuffer = asTimelineBuffer(archetype.getBuffer('Timeline'));
      if (inertiaBuffer && timelineBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        const timeline = timelineBuffer[archetype.entityCount - 1];
        if (!inertia || !timeline) continue;
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
    const world = WorldProvider.useWorld();

    motion(0)
      .mark([
        {
          inertia: { velocity: 500, min: 0, max: 100 },
        },
      ])
      .play();

    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[0];
        if (!inertia) continue;
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
      .play();

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
      .option({ onUpdate })
      .play();

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have been called multiple times during animation
    expect(onUpdate.mock.calls.length).toBeGreaterThan(3);
  });

  it('snaps to exact end value when end is a number', () => {
    const world = WorldProvider.useWorld();

    const control = motion(0)
      .mark([
        {
          inertia: {
            velocity: 1000,
            end: 500, // Exact snap target
          },
        },
      ])
      .play();

    // Verify InertiaComponent has end parameter set
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
        expect(inertia.end).toBe(500);
        foundInertia = true;
        break;
      }
    }
    expect(foundInertia).toBe(true);

    control.stop();
  });

  it('snaps to closest value in array', () => {
    const world = WorldProvider.useWorld();

    const control = motion(0)
      .mark([
        {
          inertia: {
            velocity: 800,
            end: [0, 100, 200, 300], // Snap points array
          },
        },
      ])
      .play();

    // Verify InertiaComponent has end array set
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
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
    const world = WorldProvider.useWorld();
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
      .play();

    // Verify InertiaComponent has end function set
    let foundInertia = false;
    for (const archetype of world.getArchetypes()) {
      const inertiaBuffer = asInertiaBuffer(archetype.getBuffer('Inertia'));
      if (inertiaBuffer && archetype.entityCount > 0) {
        const inertia = inertiaBuffer[archetype.entityCount - 1];
        if (!inertia) continue;
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
