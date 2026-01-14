import { SystemDef, MotionStatus, SystemContext, isPhysicsGPUEntity } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import type { ComponentValue } from '@g-motion/core';

const debug = createDebugger('SpringSystem');

type MotionStateData = ComponentValue & {
  status: MotionStatus;
  currentTime: number;
};

type TimelineData = ComponentValue & {
  tracks: Map<string, Array<{ endValue: number }>>;
};

type SpringData = ComponentValue & {
  stiffness: number;
  damping: number;
  mass: number;
  restSpeed: number;
  restDelta: number;
  velocities?: Map<string, number>;
};

type RenderData = ComponentValue & {
  props?: Record<string, number>;
  version?: number;
};

type TransformData = ComponentValue & { [key: string]: number };

/**
 * SpringSystem implements spring physics using semi-implicit Euler integration.
 * Runs before InterpolationSystem (order: 19) and takes over animation for entities with SpringComponent.
 *
 * Physics formula:
 * - force = -stiffness * displacement - damping * velocity
 * - acceleration = force / mass
 * - velocity += acceleration * dt (update velocity first)
 * - position += velocity * dt (then update position)
 *
 * This semi-implicit Euler method is more stable than basic Euler integration.
 */
export const SpringSystem: SystemDef = {
  name: 'SpringSystem',
  order: 19, // Before InterpolationSystem (20)

  update(dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) {
      return;
    }
    const config = ctx?.services.config ?? world.config;
    const timelineFlatEnabled = (config as any).timelineFlat === true;

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const springBuffer = archetype.getBuffer('Spring');
      const inertiaBuffer = archetype.getBuffer('Inertia');
      const renderBuffer = archetype.getBuffer('Render');
      const transformBuffer = archetype.getBuffer('Transform');

      // Get typed Transform buffers for optimal DOM rendering performance
      const typedBuffers: Record<string, Float32Array | Float64Array | Int32Array | undefined> = {
        x: archetype.getTypedBuffer('Transform', 'x'),
        y: archetype.getTypedBuffer('Transform', 'y'),
        translateX: archetype.getTypedBuffer('Transform', 'translateX'),
        translateY: archetype.getTypedBuffer('Transform', 'translateY'),
        translateZ: archetype.getTypedBuffer('Transform', 'translateZ'),
        z: archetype.getTypedBuffer('Transform', 'z'),
        rotate: archetype.getTypedBuffer('Transform', 'rotate'),
        rotateX: archetype.getTypedBuffer('Transform', 'rotateX'),
        rotateY: archetype.getTypedBuffer('Transform', 'rotateY'),
        rotateZ: archetype.getTypedBuffer('Transform', 'rotateZ'),
        scale: archetype.getTypedBuffer('Transform', 'scale'),
        scaleX: archetype.getTypedBuffer('Transform', 'scaleX'),
        scaleY: archetype.getTypedBuffer('Transform', 'scaleY'),
        scaleZ: archetype.getTypedBuffer('Transform', 'scaleZ'),
        perspective: archetype.getTypedBuffer('Transform', 'perspective'),
      };

      // Only process entities with spring component
      if (!springBuffer || !stateBuffer || !timelineBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const entityId = archetype.getEntityId(i);
        if (entityId >= 0 && isPhysicsGPUEntity(entityId)) {
          continue;
        }
        const state = stateBuffer[i]! as MotionStateData;
        const timeline = timelineBuffer[i]! as TimelineData;
        const spring = springBuffer[i]! as SpringData;
        const inertia = inertiaBuffer ? inertiaBuffer[i] : undefined;
        const transform = transformBuffer ? (transformBuffer[i] as TransformData) : undefined;
        const render = renderBuffer ? (renderBuffer[i] as any) : undefined;
        let changed = false;

        // Only process running entities
        if (state.status !== MotionStatus.Running) continue;

        const { stiffness, damping, mass, restSpeed, restDelta } = spring;

        // Initialize velocities map if not exists
        if (!spring.velocities || !(spring.velocities instanceof Map)) {
          spring.velocities = new Map<string, number>();
        }

        const velocities = spring.velocities as Map<string, number>;
        let allTracksAtRest = true;

        // Process each track in the timeline
        const tracks = timeline.tracks as any;
        let flatKeys: string[] | undefined;
        let flatValues: unknown[] | undefined;
        let iter: Iterator<readonly [string, unknown]> | undefined;
        if (
          timelineFlatEnabled &&
          Array.isArray(tracks?.flatKeys) &&
          Array.isArray(tracks?.flatValues)
        ) {
          flatKeys = tracks.flatKeys as string[];
          flatValues = tracks.flatValues as unknown[];
        }
        if (!flatKeys || !flatValues) {
          iter = (timeline.tracks as Iterable<readonly [string, unknown]>)[Symbol.iterator]();
        }

        let tIndex = 0;
        for (;;) {
          let key: string;
          let track: any;
          if (flatKeys && flatValues) {
            if (tIndex >= flatKeys.length) break;
            key = flatKeys[tIndex];
            track = flatValues[tIndex];
            tIndex++;
          } else {
            const next = iter!.next();
            if (next.done) break;
            key = next.value[0];
            track = next.value[1];
          }
          if (!Array.isArray(track) || track.length === 0) continue;

          // Get target value from the first (or only) keyframe's endValue
          const targetValue = track[0].endValue;

          // Get current value from typed buffer first, then Transform, then Render
          let currentValue = 0;
          if (typedBuffers[key]) {
            // Read from typed buffer if available (matches DOM renderer priority)
            currentValue = typedBuffers[key]![i];
          } else if (transform && key in transform) {
            currentValue = transform[key];
          } else if (renderBuffer) {
            const render = renderBuffer[i] as RenderData;
            if (render?.props?.[key] !== undefined) {
              currentValue = render.props[key];
            }
          }

          // Initialize velocity for this track if not exists
          if (!velocities.has(key)) {
            velocities.set(key, 0);
          }

          let velocity = velocities.get(key)!;

          // Calculate displacement (how far from target)
          const displacement = currentValue - targetValue;

          // Semi-implicit Euler integration
          // Step 1: Calculate force and acceleration
          const force = -stiffness * displacement - damping * velocity;
          const acceleration = force / mass;

          // Step 2: Update velocity first (semi-implicit)
          velocity += acceleration * (dt / 1000); // dt is in milliseconds, convert to seconds

          // Step 3: Update position using new velocity
          const newValue = currentValue + velocity * (dt / 1000);

          // Update velocity in map
          velocities.set(key, velocity);

          // Write new value to components (both typed buffers and AoS)
          let handled = false;

          if (transform && key in transform) {
            if (!Object.is(currentValue, newValue)) {
              transform[key] = newValue;
              const tbuf = typedBuffers[key];
              if (tbuf) {
                tbuf[i] = newValue;
              }
              changed = true;
            }
            handled = true;
          }

          // Fallback to Render.props when Transform is absent
          if (!handled && renderBuffer) {
            const next = newValue;
            const props = (render as RenderData | undefined)?.props;
            const prev = props ? props[key] : undefined;
            if (!Object.is(prev, next)) {
              if (render && !render.props) render.props = {};
              (render as any).props[key] = next;
              changed = true;
            }
            // No Transform component: attempt to write to typed buffer anyway
            const tbuf = typedBuffers[key];
            if (tbuf) {
              tbuf[i] = newValue;
            }
          }

          // Check if this track is at rest
          const isAtRest = Math.abs(velocity) < restSpeed && Math.abs(displacement) < restDelta;
          if (!isAtRest) {
            allTracksAtRest = false;
          } else {
            // Snap to target when at rest (both typed buffers and AoS)
            if (transform && key in transform) {
              if (!Object.is(transform[key], targetValue)) {
                transform[key] = targetValue;
                changed = true;
              }
              // Also write to typed buffer
              const tbuf = typedBuffers[key];
              if (tbuf) {
                if (!Object.is(tbuf[i], targetValue)) {
                  tbuf[i] = targetValue;
                  changed = true;
                }
              }
            } else if (renderBuffer) {
              const props = (render as RenderData | undefined)?.props;
              const prev = props ? props[key] : undefined;
              if (!Object.is(prev, targetValue)) {
                if (render && !render.props) render.props = {};
                (render as any).props[key] = targetValue;
                changed = true;
              }
              // Attempt typed buffer write
              const tbuf = typedBuffers[key];
              if (tbuf) {
                if (!Object.is(tbuf[i], targetValue)) {
                  tbuf[i] = targetValue;
                  changed = true;
                }
              }
            }
            velocities.set(key, 0);
          }
        }

        if (changed && render) {
          render.version = (render.version ?? 0) + 1;
        }

        // Mark animation as finished if all tracks are at rest
        if (allTracksAtRest && timeline.tracks.size > 0) {
          // If inertia is present, hand off velocities and let InertiaSystem continue
          if (inertia) {
            const inertiaData = inertia as any;
            if (!inertiaData.velocities || !(inertiaData.velocities instanceof Map)) {
              inertiaData.velocities = new Map<string, number>();
            }
            const inertiaVelocities = inertiaData.velocities as Map<string, number>;

            // Transfer per-track velocity if available (carry-over)
            for (const [key, v] of velocities) {
              inertiaVelocities.set(key, v);
            }

            // Remove spring component from this entity so SpringSystem stops processing
            springBuffer[i] = undefined;
            // Keep entity running for inertia to pick up
            if (typeof (world as any).setMotionStatusAt === 'function') {
              (world as any).setMotionStatusAt(archetype, i, MotionStatus.Running);
            } else {
              state.status = MotionStatus.Running;
            }
          } else {
            if (typeof (world as any).setMotionStatusAt === 'function') {
              (world as any).setMotionStatusAt(archetype, i, MotionStatus.Finished);
            } else {
              state.status = MotionStatus.Finished;
            }
          }
          debug(`Entity ${archetype.getEntityId(i)} spring animation completed`);
        }
      }
    }
  },
};
