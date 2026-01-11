/**
 * Batch Sampling Utilities
 *
 * Test reset functions and hash utilities for cache management.
 */

import { BatchBufferCache } from './buffer-cache';
import { resetArchetypeBufferCache } from './archetype-buffer-cache';
import type { Archetype } from '../../archetype';

// Module-level caches and state
const keyframesPackedCache = new Map<
  string,
  { versionSig: number; entitySig: number; channelCount: number; buffer: Float32Array }
>();

const entityIndicesScratchByArchetype = new Map<string, Int32Array>();

const archetypeScratch: Archetype[] = [];
const pickedArchetypesScratch: Archetype[] = [];

let archetypeCursor = 0;
let frameId = 0;

// Export the buffer cache instance
export const bufferCache = new BatchBufferCache();

export function getKeyframesPackedCache(): Map<
  string,
  { versionSig: number; entitySig: number; channelCount: number; buffer: Float32Array }
> {
  return keyframesPackedCache;
}

export function getEntityIndicesScratchByArchetype(): Map<string, Int32Array> {
  return entityIndicesScratchByArchetype;
}

export function getArchetypeScratch(): Archetype[] {
  return archetypeScratch;
}

export function getPickedArchetypesScratch(): Archetype[] {
  return pickedArchetypesScratch;
}

export function getArchetypeCursor(): number {
  return archetypeCursor;
}

export function setArchetypeCursor(value: number): void {
  archetypeCursor = value;
}

export function getFrameId(): number {
  return frameId;
}

export function incrementFrameId(): number {
  return frameId++;
}

export function __resetBatchSamplingCachesForTests(): void {
  keyframesPackedCache.clear();
  entityIndicesScratchByArchetype.clear();
  archetypeScratch.length = 0;
  pickedArchetypesScratch.length = 0;
  archetypeCursor = 0;
  frameId = 0;
  bufferCache.clear();
  resetArchetypeBufferCache();
}

export function hashEntityIndices(buf: Int32Array, len: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < len; i++) {
    h ^= buf[i] >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}
