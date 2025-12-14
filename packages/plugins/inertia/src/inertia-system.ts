import { SystemDef, MotionStatus, WorldProvider } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';

const debug = createDebugger('InertiaSystem');

interface MotionStateData {
  status: MotionStatus;
}

interface InertiaData {
  timeConstant: number;
  min?: number;
  max?: number;
  bounds?: { min?: number; max?: number };
  clamp?: boolean;
  snap?: number | number[];
  end?: (value: number) => void;
  modifyTarget?: (target: number) => number;
  bounceStiffness: number;
  bounceDamping: number;
  bounceMass: number;
  bounce?: boolean;
  handoff?: boolean;
  restSpeed: number;
  restDelta: number;
  velocities?: Map<string, number>;
  bounceVelocities?: Map<string, number>;
  inBounce?: Map<string, boolean>;
}

/**
 * InertiaSystem implements momentum-based motion with exponential decay.
 * Supports optional boundary bounce using spring physics.
 * Runs before InterpolationSystem (order: 19).
 *
 * Physics:
 * 1. Decay phase: velocity *= exp(-dt / timeConstant)
 *                 position += velocity * dt / 1000
 * 2. Boundary detection: check min/max or infer from 'to' parameter
 * 3. Bounce phase: spring physics when boundary hit
 *    force = -k * (x - boundary) - c * v
 *    velocity += (force / mass) * dt
 *    position += velocity * dt
 */
export const InertiaSystem: SystemDef = {
  name: 'InertiaSystem',
  order: 19, // Before InterpolationSystem (20)

  update(dt: number) {
    const world = WorldProvider.useWorld();

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const inertiaBuffer = archetype.getBuffer('Inertia');
      const renderBuffer = archetype.getBuffer('Render');
      const transformBuffer = archetype.getBuffer('Transform');

      // Only process entities with inertia component
      if (!inertiaBuffer || !stateBuffer || !timelineBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as MotionStateData;
        const timeline = timelineBuffer[i] as any;
        const inertia = inertiaBuffer[i] as InertiaData;

        // Only process running entities
        if (state.status !== MotionStatus.Running) continue;

        const {
          timeConstant,
          min,
          max,
          bounds,
          clamp,
          snap,
          end,
          modifyTarget,
          bounceStiffness,
          bounceDamping,
          bounceMass,
          bounce,
          handoff,
          restSpeed,
          restDelta,
        } = inertia;

        // Initialize maps if not exist
        if (!inertia.velocities || !(inertia.velocities instanceof Map)) {
          inertia.velocities = new Map<string, number>();
        }
        if (!inertia.bounceVelocities || !(inertia.bounceVelocities instanceof Map)) {
          inertia.bounceVelocities = new Map<string, number>();
        }
        if (!inertia.inBounce || !(inertia.inBounce instanceof Map)) {
          inertia.inBounce = new Map<string, boolean>();
        }

        const velocities = inertia.velocities as Map<string, number>;
        const bounceVelocities = inertia.bounceVelocities as Map<string, number>;
        const inBounce = inertia.inBounce as Map<string, boolean>;

        let allTracksSettled = true;

        // Process each track in the timeline
        for (const [key, track] of timeline.tracks) {
          if (!Array.isArray(track) || track.length === 0) continue;

          // Get 'to' value from keyframe (optional, used for boundary inference)
          const keyframe = track[0];
          const toValue = keyframe.endValue;
          const fromValue = keyframe.startValue;

          // Get current value from Transform or Render component
          let currentValue = 0;
          if (transformBuffer) {
            const transform = transformBuffer[i] as any;
            if (transform && key in transform) {
              currentValue = transform[key];
            }
          } else if (renderBuffer) {
            const render = renderBuffer[i] as any;
            // For primitive renderer, use __primitive key
            if (key === '__primitive' && render?.props?.__primitive !== undefined) {
              currentValue = render.props.__primitive;
            } else if (render?.props?.[key] !== undefined) {
              currentValue = render.props[key];
            }
          } else {
            // Fallback to startValue if no current value found
            currentValue = fromValue;
          }

          // Initialize velocity for this track if not exists
          // Note: velocity should be already set from Builder, but check anyway
          if (!velocities.has(key)) {
            velocities.set(key, 0);
          }
          if (!inBounce.has(key)) {
            inBounce.set(key, false);
          }

          let velocity = velocities.get(key)!;
          let isBouncing = inBounce.get(key)!;
          let newValue = currentValue;

          // Calculate natural end value (where would it stop without snap/boundary)
          const naturalEnd = currentValue + velocity * (timeConstant / 1000);

          // Apply modifyTarget hook first
          const modifiedEnd =
            typeof modifyTarget === 'function' ? modifyTarget(naturalEnd) : naturalEnd;

          // Calculate snap target based on 'snap' or legacy 'end'
          const snapInput = snap !== undefined ? snap : end;
          let snapTarget: number | undefined;
          if (snapInput !== undefined) {
            if (typeof snapInput === 'number') {
              snapTarget = snapInput;
            } else if (Array.isArray(snapInput) && snapInput.length > 0) {
              snapTarget = snapInput.reduce((closest: number, val: number) => {
                return Math.abs(val - modifiedEnd) < Math.abs(closest - modifiedEnd)
                  ? val
                  : closest;
              }, snapInput[0]);
            } else if (typeof snapInput === 'function') {
              snapTarget = snapInput(modifiedEnd);
            }
          }

          // Determine boundaries (explicit bounds/min/max or inferred from 'to' or snap target)
          let effectiveMin = bounds?.min ?? min;
          let effectiveMax = bounds?.max ?? max;

          if (snapTarget !== undefined) {
            if (velocity > 0 && effectiveMax === undefined) {
              effectiveMax = snapTarget;
            } else if (velocity < 0 && effectiveMin === undefined) {
              effectiveMin = snapTarget;
            }
          } else if (toValue !== undefined && toValue !== fromValue) {
            if (velocity > 0 && effectiveMax === undefined) {
              effectiveMax = toValue;
            } else if (velocity < 0 && effectiveMin === undefined) {
              effectiveMin = toValue;
            }
          }

          const handoffTarget =
            handoff?.type === 'spring'
              ? (handoff.to ??
                (toValue !== undefined ? toValue : velocity >= 0 ? effectiveMax : effectiveMin))
              : undefined;

          let displacement = 0;

          if (!isBouncing) {
            // === Decay Phase ===
            // Exponential decay: velocity *= exp(-dt / timeConstant)
            const decayFactor = Math.exp(-dt / timeConstant);
            velocity *= decayFactor;

            // Update position: position += velocity * dt (convert ms to seconds)
            newValue = currentValue + velocity * (dt / 1000);

            // === Boundary Detection ===
            let hitBoundary = false;
            let boundaryValue: number | undefined;

            if (effectiveMax !== undefined && newValue >= effectiveMax) {
              newValue = effectiveMax;
              boundaryValue = effectiveMax;
              hitBoundary = true;
            } else if (effectiveMin !== undefined && newValue <= effectiveMin) {
              newValue = effectiveMin;
              boundaryValue = effectiveMin;
              hitBoundary = true;
            }

            if (hitBoundary) {
              if (clamp) {
                velocities.set(key, 0);
                bounceVelocities.set(key, 0);
                newValue = boundaryValue as number;
              } else if (bounce !== false) {
                inBounce.set(key, true);
                bounceVelocities.set(key, velocity); // Transfer velocity to bounce
                velocities.set(key, 0); // Reset decay velocity
                debug(`Track '${key}' hit boundary at ${boundaryValue}, entering bounce mode`);
              } else {
                velocities.set(key, 0);
                bounceVelocities.set(key, 0);
                newValue = boundaryValue as number;
              }
            } else {
              velocities.set(key, velocity);
            }
          } else {
            // === Bounce Phase (Spring Physics) ===
            // Use semi-implicit Euler integration for spring
            if (!bounceVelocities.has(key)) {
              bounceVelocities.set(key, 0);
            }
            let bounceVelocity = bounceVelocities.get(key)!;

            // Determine spring target (the boundary that was hit)
            let springTarget = currentValue; // Fallback
            if (effectiveMax !== undefined && currentValue >= effectiveMax - restDelta) {
              springTarget = effectiveMax;
            } else if (effectiveMin !== undefined && currentValue <= effectiveMin + restDelta) {
              springTarget = effectiveMin;
            }

            // Calculate displacement from boundary
            displacement = currentValue - springTarget;

            // Spring force: F = -k * x - c * v
            const force = -bounceStiffness * displacement - bounceDamping * bounceVelocity;
            const acceleration = force / bounceMass;

            // Update velocity (semi-implicit)
            bounceVelocity += acceleration * (dt / 1000);

            // Update position
            newValue = currentValue + bounceVelocity * (dt / 1000);

            bounceVelocities.set(key, bounceVelocity);

            // Check if bounce is settled
            const isSettled =
              Math.abs(bounceVelocity) < restSpeed && Math.abs(displacement) < restDelta;

            if (isSettled) {
              // Exit bounce mode
              inBounce.set(key, false);
              bounceVelocities.set(key, 0);
              // Snap to boundary
              newValue = springTarget;
              debug(`Track '${key}' bounce settled at ${springTarget}`);
            }
          }

          // Write new value to components
          let handled = false;
          if (transformBuffer && key in transformBuffer[i]) {
            transformBuffer[i][key] = newValue;
            handled = true;
          }

          if (!handled && renderBuffer) {
            const render = renderBuffer[i];
            if (!render.props) render.props = {};
            // For primitive renderer, write to __primitive
            if (key === '__primitive') {
              render.props.__primitive = newValue;
            } else {
              render.props[key] = newValue;
            }
          }

          // Check if this track is settled (velocity and displacement thresholds)
          const trackVelocity = isBouncing ? bounceVelocities.get(key)! : velocities.get(key)!;
          const positionDelta = isBouncing
            ? effectiveMax !== undefined && currentValue >= effectiveMax - restDelta
              ? currentValue - effectiveMax
              : effectiveMin !== undefined && currentValue <= effectiveMin + restDelta
                ? currentValue - effectiveMin
                : displacement
            : 0;
          const isTrackSettled =
            Math.abs(trackVelocity) < restSpeed && Math.abs(positionDelta) < restDelta;

          if (!isTrackSettled) {
            allTracksSettled = false;
          } else if (!isBouncing && handoffTarget !== undefined) {
            // Trigger handoff by entering bounce-like settle toward target next frame
            inBounce.set(key, true);
            bounceVelocities.set(key, velocity);
            velocities.set(key, 0);
            // Force boundaries to handoff target for subsequent bounce pass
            if (effectiveMin === undefined && effectiveMax === undefined) {
              effectiveMin = effectiveMax = handoffTarget;
            }
            allTracksSettled = false;
          }
        }

        // Mark animation as finished if all tracks are settled
        if (allTracksSettled && timeline.tracks.size > 0) {
          state.status = MotionStatus.Finished;
          debug(`Entity ${archetype.getEntityId(i)} inertia animation completed`);
        }
      }
    }
  },
};
