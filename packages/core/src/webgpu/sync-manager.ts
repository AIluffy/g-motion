// --- GPU result delivery queue (Phase 1: primitive channel) ---
export type GPUResultPacket = {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  values: Float32Array; // one value per entity (primitive)
  // Phase 4: Multi-channel support
  stride?: number; // values per entity (default 1)
  channels?: Array<{ index: number; property: string }>; // channel mapping (optional)
  finished?: Uint32Array; // optional per-slot finished flags (1 finished, 0 active)
};

const _resultQueue: GPUResultPacket[] = [];
let _pendingReadbackCount = 0;
let _wakeup: (() => void) | undefined;
const _physicsGPUEntityIds = new Set<number>();
let _forcedPhysicsSyncEntityIds = new Set<number>();

export function setGPUResultWakeup(fn: (() => void) | undefined): void {
  _wakeup = fn;
}

export function setPendingReadbackCount(count: number): void {
  _pendingReadbackCount = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
}

export function getPendingReadbackCount(): number {
  return _pendingReadbackCount;
}

export function getGPUResultQueueLength(): number {
  return _resultQueue.length;
}

export function enqueueGPUResults(p: GPUResultPacket): void {
  _resultQueue.push(p);
  try {
    _wakeup?.();
  } catch {
    // ignore
  }
}

export function drainGPUResults(): GPUResultPacket[] {
  return drainGPUResultsInto();
}

export function drainGPUResultsInto(out: GPUResultPacket[] = []): GPUResultPacket[] {
  out.length = 0;
  const n = _resultQueue.length;
  if (n === 0) {
    return out;
  }
  for (let i = 0; i < n; i++) {
    out.push(_resultQueue[i]);
  }
  _resultQueue.length = 0;
  return out;
}

export function isPhysicsGPUEntity(entityId: number): boolean {
  return _physicsGPUEntityIds.has(entityId);
}

export function markPhysicsGPUEntity(entityId: number): void {
  _physicsGPUEntityIds.add(entityId);
}

export function unmarkPhysicsGPUEntity(entityId: number): void {
  _physicsGPUEntityIds.delete(entityId);
}

export function clearPhysicsGPUEntities(): void {
  _physicsGPUEntityIds.clear();
}

export function forceGPUStateSync(entityId: number): void {
  if (typeof entityId !== 'number' || !Number.isFinite(entityId)) return;
  _forcedPhysicsSyncEntityIds.add(entityId | 0);
  try {
    _wakeup?.();
  } catch {
    // ignore
  }
}

export function consumeForcedGPUStateSyncEntityIdsSet(): Set<number> {
  const out = _forcedPhysicsSyncEntityIds;
  _forcedPhysicsSyncEntityIds = new Set<number>();
  return out;
}

export function consumeForcedGPUStateSyncEntityIds(): number[] {
  const set = consumeForcedGPUStateSyncEntityIdsSet();
  if (set.size === 0) return [];
  const out = new Array<number>(set.size);
  let i = 0;
  for (const id of set) {
    out[i] = id;
    i++;
  }
  return out;
}
