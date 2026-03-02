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

export class GPUSyncManager {
  private resultQueue: GPUResultPacket[] = [];
  private pendingReadbackCount = 0;
  private wakeup: (() => void) | undefined;
  private physicsGPUEntityIds = new Set<number>();
  private forcedPhysicsSyncEntityIds = new Set<number>();

  setGPUResultWakeup(fn: (() => void) | undefined): void {
    this.wakeup = fn;
  }

  setPendingReadbackCount(count: number): void {
    this.pendingReadbackCount = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
  }

  getPendingReadbackCount(): number {
    return this.pendingReadbackCount;
  }

  getGPUResultQueueLength(): number {
    return this.resultQueue.length;
  }

  enqueueGPUResults(p: GPUResultPacket): void {
    this.resultQueue.push(p);
    try {
      this.wakeup?.();
    } catch {
      // ignore
    }
  }

  drainGPUResults(): GPUResultPacket[] {
    return this.drainGPUResultsInto();
  }

  drainGPUResultsInto(out: GPUResultPacket[] = []): GPUResultPacket[] {
    out.length = 0;
    const n = this.resultQueue.length;
    if (n === 0) {
      return out;
    }
    for (let i = 0; i < n; i++) {
      out.push(this.resultQueue[i]);
    }
    this.resultQueue.length = 0;
    return out;
  }

  isPhysicsGPUEntity(entityId: number): boolean {
    return this.physicsGPUEntityIds.has(entityId);
  }

  markPhysicsGPUEntity(entityId: number): void {
    this.physicsGPUEntityIds.add(entityId);
  }

  unmarkPhysicsGPUEntity(entityId: number): void {
    this.physicsGPUEntityIds.delete(entityId);
  }

  clearPhysicsGPUEntities(): void {
    this.physicsGPUEntityIds.clear();
  }

  forceGPUStateSync(entityId: number): void {
    if (typeof entityId !== 'number' || !Number.isFinite(entityId)) return;
    this.forcedPhysicsSyncEntityIds.add(entityId | 0);
    try {
      this.wakeup?.();
    } catch {
      // ignore
    }
  }

  consumeForcedGPUStateSyncEntityIdsSet(): Set<number> {
    const out = this.forcedPhysicsSyncEntityIds;
    this.forcedPhysicsSyncEntityIds = new Set<number>();
    return out;
  }

  consumeForcedGPUStateSyncEntityIds(): number[] {
    const set = this.consumeForcedGPUStateSyncEntityIdsSet();
    if (set.size === 0) return [];
    const out = new Array<number>(set.size);
    let i = 0;
    for (const id of set) {
      out[i] = id;
      i++;
    }
    return out;
  }

  clear(): void {
    this.resultQueue.length = 0;
    this.pendingReadbackCount = 0;
    this.wakeup = undefined;
    this.physicsGPUEntityIds.clear();
    this.forcedPhysicsSyncEntityIds.clear();
  }
}

let defaultSyncManager: GPUSyncManager | null = null;

export function setDefaultGPUSyncManager(manager: GPUSyncManager | null): void {
  defaultSyncManager = manager;
}

export function getDefaultGPUSyncManager(): GPUSyncManager {
  if (!defaultSyncManager) {
    defaultSyncManager = new GPUSyncManager();
  }
  return defaultSyncManager;
}

export function setGPUResultWakeup(fn: (() => void) | undefined): void {
  getDefaultGPUSyncManager().setGPUResultWakeup(fn);
}

export function setPendingReadbackCount(count: number): void {
  getDefaultGPUSyncManager().setPendingReadbackCount(count);
}

export function getPendingReadbackCount(): number {
  return getDefaultGPUSyncManager().getPendingReadbackCount();
}

export function getGPUResultQueueLength(): number {
  return getDefaultGPUSyncManager().getGPUResultQueueLength();
}

export function enqueueGPUResults(p: GPUResultPacket): void {
  getDefaultGPUSyncManager().enqueueGPUResults(p);
}

export function drainGPUResults(): GPUResultPacket[] {
  return getDefaultGPUSyncManager().drainGPUResults();
}

export function drainGPUResultsInto(out: GPUResultPacket[] = []): GPUResultPacket[] {
  return getDefaultGPUSyncManager().drainGPUResultsInto(out);
}

export function isPhysicsGPUEntity(entityId: number): boolean {
  return getDefaultGPUSyncManager().isPhysicsGPUEntity(entityId);
}

export function markPhysicsGPUEntity(entityId: number): void {
  getDefaultGPUSyncManager().markPhysicsGPUEntity(entityId);
}

export function unmarkPhysicsGPUEntity(entityId: number): void {
  getDefaultGPUSyncManager().unmarkPhysicsGPUEntity(entityId);
}

export function clearPhysicsGPUEntities(): void {
  getDefaultGPUSyncManager().clearPhysicsGPUEntities();
}

export function forceGPUStateSync(entityId: number): void {
  getDefaultGPUSyncManager().forceGPUStateSync(entityId);
}

export function consumeForcedGPUStateSyncEntityIdsSet(): Set<number> {
  return getDefaultGPUSyncManager().consumeForcedGPUStateSyncEntityIdsSet();
}

export function consumeForcedGPUStateSyncEntityIds(): number[] {
  return getDefaultGPUSyncManager().consumeForcedGPUStateSyncEntityIds();
}
