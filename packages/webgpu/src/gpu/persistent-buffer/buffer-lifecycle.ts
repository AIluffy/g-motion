import type { PersistentBuffer } from './types';

export interface BufferStateStore {
  buffers: Map<string, PersistentBuffer>;
  previousData: Map<string, Uint8Array>;
  previousUploadBytes: Map<string, Uint8Array>;
  previousDataHash: Map<string, number>;
  previousDataLength: Map<string, number>;
}

export function removeBufferTracking(state: BufferStateStore, key: string): void {
  state.buffers.delete(key);
  state.previousData.delete(key);
  state.previousUploadBytes.delete(key);
  state.previousDataHash.delete(key);
  state.previousDataLength.delete(key);
}

export function destroyTrackedBuffer(state: BufferStateStore, key: string): void {
  const existing = state.buffers.get(key);
  if (!existing) {
    return;
  }
  existing.buffer.destroy();
  removeBufferTracking(state, key);
}

export function recycleUnusedBuffers(
  state: BufferStateStore,
  currentFrame: number,
  recycleThreshold: number,
): void {
  const toRemove: string[] = [];
  for (const [key, buffer] of state.buffers.entries()) {
    const framesUnused = currentFrame - buffer.lastUsedFrame;
    if (framesUnused > recycleThreshold) {
      buffer.buffer.destroy();
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    removeBufferTracking(state, key);
  }
}

export function disposeAllBuffers(state: BufferStateStore): void {
  for (const buffer of state.buffers.values()) {
    buffer.buffer.destroy();
  }
  state.buffers.clear();
  state.previousData.clear();
  state.previousUploadBytes.clear();
  state.previousDataHash.clear();
  state.previousDataLength.clear();
}
