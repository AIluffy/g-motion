/**
 * Physics Slot Writers
 *
 * Low-level functions that write one GPU physics slot (PHYSICS_STATE_STRIDE = 16 floats)
 * for each of the three physics variants: Spring, Inertia, and the empty fallback.
 *
 * Slot layout (16 floats):
 *   [0]  position      [1]  velocity       [2]  target       [3]  fromValue
 *   [4]  stiffness/tc  [5]  damping/min    [6]  mass/max     [7]  restSpeed
 *   [8]  restDelta     [9]  clamp          [10] bounceOn     [11] bounceK
 *   [12] bounceD       [13] bounceM        [14] type(0/1)    [15] reserved
 */

import type { InertiaComponentData, SpringComponentData } from '@g-motion/protocol';

export function writeSpringSlot(
  buf: Float32Array,
  base: number,
  position: number,
  target: number,
  spring: SpringComponentData,
  prop: string,
): void {
  const velocities = spring.velocities instanceof Map ? spring.velocities : undefined;
  const v0 = velocities ? Number(velocities.get(prop) ?? 0) : 0;
  buf[base] = position;
  buf[base + 1] = Number.isFinite(v0) ? v0 : 0;
  buf[base + 2] = Number.isFinite(target) ? target : position;
  buf[base + 3] = 0;
  buf[base + 4] = Number(spring.stiffness ?? 0);
  buf[base + 5] = Number(spring.damping ?? 0);
  buf[base + 6] = Number(spring.mass ?? 1);
  buf[base + 7] = Number(spring.restSpeed ?? 0.001);
  buf[base + 8] = Number(spring.restDelta ?? 0.001);
  buf[base + 9] = 0;
  buf[base + 10] = 0;
  buf[base + 11] = 0;
  buf[base + 12] = 0;
  buf[base + 13] = 0;
  buf[base + 14] = 0; // type: spring
  buf[base + 15] = 0;
}

export function writeInertiaSlot(
  buf: Float32Array,
  base: number,
  position: number,
  target: number,
  fromValue: number,
  inertia: InertiaComponentData,
  prop: string,
): void {
  const velocities = inertia.velocities instanceof Map ? inertia.velocities : undefined;
  const v0 = velocities ? Number(velocities.get(prop) ?? 0) : 0;
  const bc = inertia.bounce;
  const bounceOn = bc !== false;
  const bk = bounceOn ? Number(bc?.stiffness ?? 500) : 0;
  const bd = bounceOn ? Number(bc?.damping ?? 10) : 0;
  const bm = bounceOn ? Number(bc?.mass ?? 1) : 1;
  const bounds = inertia.bounds;
  const minB = bounds?.min ?? inertia.min;
  const maxB = bounds?.max ?? inertia.max;

  buf[base] = position;
  buf[base + 1] = Number.isFinite(v0) ? v0 : 0;
  buf[base + 2] = Number.isFinite(target) ? target : position;
  buf[base + 3] = Number.isFinite(fromValue) ? fromValue : position;
  buf[base + 4] = Number(inertia.timeConstant ?? 0);
  buf[base + 5] = Number.isFinite(minB) ? Number(minB) : Number.NaN;
  buf[base + 6] = Number.isFinite(maxB) ? Number(maxB) : Number.NaN;
  buf[base + 7] = Number(inertia.restSpeed ?? 0.5);
  buf[base + 8] = Number(inertia.restDelta ?? 0.5);
  buf[base + 9] = inertia.clamp ? 1 : 0;
  buf[base + 10] = bounceOn ? 1 : 0;
  buf[base + 11] = Number.isFinite(bk) ? bk : 0;
  buf[base + 12] = Number.isFinite(bd) ? bd : 0;
  buf[base + 13] = Number.isFinite(bm) ? bm : 1;
  buf[base + 14] = 1; // type: inertia
  buf[base + 15] = 0;
}

export function writeEmptySlot(buf: Float32Array, base: number, position: number): void {
  buf[base] = position;
  buf[base + 1] = 0;
  buf[base + 2] = position;
  buf[base + 3] = position;
  buf[base + 4] = 0;
  buf[base + 5] = Number.NaN;
  buf[base + 6] = Number.NaN;
  for (let j = 7; j < 16; j++) buf[base + j] = 0;
}
