/**
 * State Packer
 *
 * Responsibility: Pack per-entity runtime animation state (startTime, currentTime,
 * playbackRate, MotionStatus) into a flat GPU-uploadable Float32Array.
 *
 * Layout per entity (4 floats, stride = 4):
 *   [0] startTime
 *   [1] currentTime
 *   [2] playbackRate
 *   [3] status (MotionStatus enum value)
 *
 * Also computes a rolling FNV-1a version hash over the packed values so that
 * the caller can detect state changes without a deep comparison.
 */

import type { MotionStateData } from '@g-motion/shared';
import { MotionStatus } from '../../components/state';
import { bufferCache, hashMotionStateVersionStep } from './utils';

/** Output of {@link packEntityStates}. */
export interface PackedStates {
  /** Flat, GPU-uploadable array of entity states (stride = 4 floats/entity). */
  data: Float32Array;
  /** FNV-1a rolling hash of all packed values. Changes when any value changes. */
  version: number;
  /** Count of Running entities in this batch. */
  runningCount: number;
  /** Count of Paused entities in this batch. */
  pausedCount: number;
}

/** Inputs required by {@link packEntityStates}. */
export interface StatePackerInput {
  archetypeId: string;
  entityIndicesBuf: Int32Array;
  entityCount: number;
  stateBuffer: Array<unknown>;
  /** Typed SoA views – may be undefined when archetype uses AoS layout. */
  typedStatus: Float32Array | Float64Array | Int32Array | undefined;
  typedStartTime: Float32Array | Float64Array | Int32Array | undefined;
  typedCurrentTime: Float32Array | Float64Array | Int32Array | undefined;
  typedPlaybackRate: Float32Array | Float64Array | Int32Array | undefined;
  /**
   * When provided, the caller already owns this buffer (reuse path).
   * When omitted, a buffer is acquired from {@link bufferCache}.
   */
  existingBuffer?: Float32Array;
}

/**
 * Pack entity animation states into a flat Float32Array for GPU upload.
 *
 * @returns The packed array together with a version hash and running/paused counts.
 */
export function packEntityStates(input: StatePackerInput): PackedStates {
  const {
    archetypeId,
    entityIndicesBuf,
    entityCount,
    stateBuffer,
    typedStatus,
    typedStartTime,
    typedCurrentTime,
    typedPlaybackRate,
    existingBuffer,
  } = input;

  const statesData: Float32Array =
    existingBuffer ?? bufferCache.getStatesBuffer(archetypeId, entityCount * 4);

  let version = 2166136261 >>> 0; // FNV-1a seed
  let runningCount = 0;
  let pausedCount = 0;

  for (let eIndex = 0; eIndex < entityCount; eIndex++) {
    const i = entityIndicesBuf[eIndex];
    const stateObj = stateBuffer[i] as MotionStateData;

    const status = typedStatus
      ? (typedStatus[i] as unknown as MotionStatus)
      : (stateObj.status as unknown as MotionStatus);

    if (status === MotionStatus.Running) runningCount++;
    else if (status === MotionStatus.Paused) pausedCount++;

    const startTime = typedStartTime ? typedStartTime[i] : Number(stateObj.startTime ?? 0);
    const currentTime = typedCurrentTime
      ? (typedCurrentTime[i] as unknown as number)
      : Number(stateObj.currentTime ?? 0);
    const playbackRate = typedPlaybackRate
      ? typedPlaybackRate[i]
      : Number(stateObj.playbackRate ?? 1);

    const offset = eIndex * 4;
    statesData[offset] = startTime;
    statesData[offset + 1] = currentTime;
    statesData[offset + 2] = playbackRate;
    statesData[offset + 3] = status as unknown as number;

    version = hashMotionStateVersionStep(
      version,
      startTime,
      currentTime,
      playbackRate,
      status as unknown as number,
    );
  }

  return { data: statesData, version, runningCount, pausedCount };
}
