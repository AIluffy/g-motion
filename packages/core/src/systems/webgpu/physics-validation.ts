/**
 * Physics Shadow Simulation
 *
 * CPU-side physics validation to verify GPU compute correctness.
 * Used when config.physicsValidation === true.
 */

import { PHYSICS_STATE_STRIDE } from '@g-motion/webgpu';

export interface PhysicsValidationShadow {
  slotCount: number;
  state: Float32Array;
  lastWarnFrame: number;
}

export const physicsValidationShadow = new Map<string, PhysicsValidationShadow>();

export function f32(n: number): number {
  return Math.fround(n);
}

export function stepPhysicsShadow(
  state: Float32Array,
  dtMs: number,
  dtSec: number,
  maxVelocity: number,
): void {
  const slots = Math.floor(state.length / PHYSICS_STATE_STRIDE);
  const maxVel = f32(maxVelocity);
  for (let s = 0; s < slots; s++) {
    const base = s * PHYSICS_STATE_STRIDE;
    const kind = state[base + 14] ?? 0;

    if (kind < 0.5) {
      // Spring physics
      const position = f32(state[base + 0] ?? 0);
      const velocity = f32(state[base + 1] ?? 0);
      const target = f32(state[base + 2] ?? position);
      const stiffness = f32(state[base + 4] ?? 0);
      const damping = f32(state[base + 5] ?? 0);
      const mass = Math.max(0.001, f32(state[base + 6] ?? 1));
      const restSpeed = f32(state[base + 7] ?? 0);
      const restDelta = f32(state[base + 8] ?? 0);

      const displacement = f32(position - target);
      const force = f32(-stiffness * displacement - damping * velocity);
      const acceleration = f32(force / mass);
      let v = f32(velocity + acceleration * f32(dtSec));
      v = f32(Math.max(-maxVel, Math.min(maxVel, v)));
      let p = f32(position + v * f32(dtSec));

      const done = Math.abs(v) < restSpeed && Math.abs(displacement) < restDelta;
      if (done) {
        p = target;
        v = 0;
      }
      state[base + 0] = p;
      state[base + 1] = v;
      continue;
    }

    // Decay/Inertia physics
    let position = f32(state[base + 0] ?? 0);
    let velocity = f32(state[base + 1] ?? 0);
    let mode = f32(state[base + 15] ?? 0);

    const timeConstant = Math.max(0.001, f32(state[base + 4] ?? 0));
    const minB = state[base + 5];
    const maxB = state[base + 6];
    const restSpeed = f32(state[base + 7] ?? 0);
    const restDelta = f32(state[base + 8] ?? 0);
    const clampOn = (state[base + 9] ?? 0) >= 0.5;
    const bounceOn = (state[base + 10] ?? 0) >= 0.5;
    const hasMin = Number.isFinite(minB);
    const hasMax = Number.isFinite(maxB);

    if (mode < 0.5) {
      // Decay mode
      const decayFactor = f32(Math.exp(-dtMs / timeConstant));
      velocity = f32(velocity * decayFactor);
      position = f32(position + velocity * f32(dtSec));

      let hit = false;
      let boundary = position;
      if (hasMax && position >= (maxB as number)) {
        hit = true;
        boundary = maxB as number;
      } else if (hasMin && position <= (minB as number)) {
        hit = true;
        boundary = minB as number;
      }
      if (hit) {
        position = f32(boundary);
        if (clampOn || !bounceOn) {
          velocity = 0;
        } else {
          mode = 1;
        }
      }
      state[base + 0] = position;
      state[base + 1] = velocity;
      state[base + 15] = mode;
      continue;
    }

    // Spring-boundary mode
    let springTarget = position;
    if (hasMax && position >= (maxB as number) - restDelta) {
      springTarget = maxB as number;
    } else if (hasMin && position <= (minB as number) + restDelta) {
      springTarget = minB as number;
    }

    const displacement = f32(position - f32(springTarget));
    const stiffness = f32(state[base + 11] ?? 0);
    const damping = f32(state[base + 12] ?? 0);
    const mass = Math.max(0.001, f32(state[base + 13] ?? 1));
    const force = f32(-stiffness * displacement - damping * velocity);
    const acceleration = f32(force / mass);
    velocity = f32(velocity + acceleration * f32(dtSec));
    position = f32(position + velocity * f32(dtSec));

    const done = Math.abs(velocity) < restSpeed && Math.abs(displacement) < restDelta;
    if (done) {
      mode = 0;
      velocity = 0;
      position = f32(springTarget);
    }

    state[base + 0] = position;
    state[base + 1] = velocity;
    state[base + 15] = mode;
  }
}

export function getPhysicsValidationShadow(): Map<string, PhysicsValidationShadow> {
  return physicsValidationShadow;
}

export function setPhysicsValidationShadow(
  archetypeId: string,
  slotCount: number,
  stateData: ArrayBuffer,
): void {
  physicsValidationShadow.set(archetypeId, {
    slotCount,
    state: new Float32Array(stateData),
    lastWarnFrame: -1,
  });
}

export function clearPhysicsValidationShadow(): void {
  physicsValidationShadow.clear();
}
