/**
 * Physics Assembler
 *
 * Responsibility: Assemble per-entity physics state (Spring / Inertia parameters)
 * into a flat, GPU-uploadable Float32Array for the physics compute pipeline.
 *
 * Also exports {@link discoverPhysicsChannels} which scans running-entity timelines
 * to derive a channel layout when no registered layout exists.
 *
 * Slot layout (PHYSICS_STATE_STRIDE = 16 floats) is documented in physics-slots.ts.
 * Slot writers are delegated to that module for per-type compactness.
 */

import type {
  InertiaComponentData,
  MotionStateData,
  RenderData,
  SpringComponentData,
  TimelineComponentData,
  TimelineData,
  Track,
} from '@g-motion/shared';
import { MotionStatus } from '../../components/state';
import { PHYSICS_STATE_STRIDE } from '@g-motion/webgpu/internal';
import type { ArchetypeTypedBuffer } from '../../archetype';
import { writeEmptySlot, writeInertiaSlot, writeSpringSlot } from './physics-slots';

export interface PhysicsAssemblerInput {
  physicsArchetypeId: string;
  archetypeId: string;
  entityIndicesBuf: Int32Array;
  entityCount: number;
  channels: Array<{ index: number; property: string }>;
  stride: number;
  timelineBuffer: Array<unknown>;
  renderBuffer: Array<unknown>;
  springBuffer: Array<unknown>;
  inertiaBuffer: Array<unknown>;
  transformBuffer: Array<unknown> | undefined;
  /** Returns the typed SoA buffer for a given transform property. */
  getTypedTransformBuffer: (prop: string) => ArchetypeTypedBuffer | undefined;
}

export interface AssembledPhysicsState {
  /** Packed GPU state array, or `undefined` when no upload is needed. */
  stateData: Float32Array | undefined;
  /** Monotonically increasing version, bumped on every upload. */
  stateVersion: number;
  /** Total slot count (entityCount × stride). */
  slotCount: number;
}

/**
 * Assemble physics state for one archetype batch.
 *
 * `stateData` is only populated when `needsUpload === true`; otherwise the
 * caller should reuse the previously uploaded GPU buffer unchanged.
 */
export function assemblePhysicsState(
  input: PhysicsAssemblerInput,
  needsUpload: boolean,
  prevStateVersion: number,
): AssembledPhysicsState {
  const {
    entityIndicesBuf,
    entityCount,
    channels,
    stride,
    timelineBuffer,
    springBuffer,
    inertiaBuffer,
    transformBuffer,
    renderBuffer,
    getTypedTransformBuffer,
  } = input;

  const slotCount = entityCount * stride;
  if (!needsUpload) return { stateData: undefined, stateVersion: prevStateVersion, slotCount };

  const stateVersion = (prevStateVersion + 1) >>> 0;
  const stateData = new Float32Array(slotCount * PHYSICS_STATE_STRIDE);

  // Pre-fetch typed transform buffers once per channel
  const typedTransformByProp: Record<string, ArchetypeTypedBuffer | undefined> = {};
  for (let c = 0; c < stride; c++)
    typedTransformByProp[channels[c].property] = getTypedTransformBuffer(channels[c].property);

  for (let eIndex = 0; eIndex < entityCount; eIndex++) {
    const i = entityIndicesBuf[eIndex];
    const tracks = (timelineBuffer[i] as TimelineComponentData)?.tracks;
    const spring = springBuffer[i] as SpringComponentData | undefined;
    const inertia = inertiaBuffer[i] as InertiaComponentData | undefined;
    const render = renderBuffer[i] as RenderData;
    const transform = transformBuffer ? (transformBuffer[i] as Record<string, unknown>) : undefined;

    for (let c = 0; c < stride; c++) {
      const prop = channels[c].property;
      const base = (eIndex * stride + c) * PHYSICS_STATE_STRIDE;

      // Current position: typed buffer → AoS transform → render.props
      const tbuf = typedTransformByProp[prop];
      let position = tbuf
        ? Number(tbuf[i] ?? 0)
        : transform && prop in transform
          ? Number(transform[prop] ?? 0)
          : render?.props?.[prop] !== undefined
            ? Number(render.props[prop])
            : 0;
      if (!Number.isFinite(position)) position = 0;

      const track = tracks?.get(prop) as Track | undefined;
      const first = Array.isArray(track) && track.length ? track[0] : undefined;
      const target = first ? Number(first.endValue ?? position) : position;
      const fromValue = first ? Number(first.startValue ?? position) : position;

      if (spring) {
        writeSpringSlot(stateData, base, position, target, spring, prop);
        continue;
      }
      if (inertia) {
        writeInertiaSlot(stateData, base, position, target, fromValue, inertia, prop);
        continue;
      }
      writeEmptySlot(stateData, base, position);
    }
  }

  return { stateData, stateVersion, slotCount };
}

/**
 * Scan running entities in an archetype to discover which track properties are
 * animated by physics. Returns at most 32 unique property names, sorted.
 * Used when no registered GPU channel layout exists for the archetype.
 */
export function discoverPhysicsChannels(
  entityCount: number,
  stateBuffer: Array<unknown>,
  timelineBuffer: Array<unknown>,
  springBuffer: Array<unknown> | undefined,
  inertiaBuffer: Array<unknown> | undefined,
  typedStatus: Float32Array | Float64Array | Int32Array | undefined,
): Array<{ index: number; property: string }> {
  const keys = new Set<string>();
  for (let i = 0; i < entityCount && keys.size < 32; i++) {
    if (!(springBuffer?.[i] != null || inertiaBuffer?.[i] != null)) continue;
    const st = typedStatus
      ? (typedStatus[i] as unknown as MotionStatus)
      : ((stateBuffer[i] as MotionStateData).status as unknown as MotionStatus);
    if (st !== MotionStatus.Running) continue;
    const tracks = (timelineBuffer[i] as TimelineComponentData)?.tracks as TimelineData | undefined;
    if (tracks && typeof tracks.keys === 'function') {
      for (const k of tracks.keys()) keys.add(String(k));
    }
  }
  return Array.from(keys)
    .sort()
    .map((property, index) => ({ index, property }));
}
