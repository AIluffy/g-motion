import { ComponentRegistry } from './registry';
import { EntityManager } from './entity';
import { SystemScheduler } from './scheduler';
import { Archetype, ArchetypeInternal } from './archetype';
import { MotionAppConfig } from './plugin';
import { ErrorCode, ErrorSeverity, MotionError } from './errors';

/**
 * Component data type
 */
type ComponentData = Record<string, unknown>;

/**
 * Burst manager for high-performance batch entity creation/destruction
 */
class BurstManager {
  private pendingDeletions: number[] = [];

  constructor(
    private entityManager: EntityManager,
    private entityArchetypes: Map<number, Archetype>,
  ) {}

  /**
   * Reserve capacity in archetype for burst operations
   */
  reserveCapacity(archetype: Archetype, totalSize: number): void {
    const internal = archetype as ArchetypeInternal;
    const current = archetype.entityCount;
    if (current >= totalSize) return;

    let capacity = internal.getInternalCapacity();
    while (capacity < totalSize) {
      capacity *= 2;
    }

    if (capacity !== internal.getInternalCapacity()) {
      internal.resize(capacity);
    }
  }

  /**
   * Create multiple entities in one batch with pre-allocation
   */
  createBatch(archetype: Archetype, dataArray: ComponentData[]): number[] {
    const count = dataArray.length;
    const createdIds: number[] = [];

    // Pre-allocate once
    this.reserveCapacity(archetype, archetype.entityCount + count);

    // Batch create all entities
    for (const data of dataArray) {
      const entityId = this.entityManager.create();
      archetype.addEntity(entityId, data);
      this.entityArchetypes.set(entityId, archetype);
      createdIds.push(entityId);
    }

    return createdIds;
  }

  /**
   * Mark entities for deferred deletion
   */
  markForDeletion(entityIds: number[]): void {
    this.pendingDeletions.push(...entityIds);
  }

  /**
   * Process all pending deletions efficiently
   */
  flushDeletions(): void {
    if (this.pendingDeletions.length === 0) return;

    // Group by archetype
    const byArchetype = new Map<Archetype, number[]>();
    for (const entityId of this.pendingDeletions) {
      const archetype = this.entityArchetypes.get(entityId);
      if (archetype) {
        if (!byArchetype.has(archetype)) {
          byArchetype.set(archetype, []);
        }
        byArchetype.get(archetype)!.push(entityId);
      }
    }

    // Remove from each archetype (highest indices first to avoid index shifts)
    for (const [archetype, entityIds] of byArchetype) {
      const internal = archetype as ArchetypeInternal;
      const indices = internal.getInternalEntityIndices();
      entityIds.sort((a, b) => {
        const indexA = indices.get(a) ?? -1;
        const indexB = indices.get(b) ?? -1;
        return indexB - indexA;
      });

      for (const entityId of entityIds) {
        this.removeEntityFromArchetype(archetype, entityId);
      }
    }

    this.pendingDeletions.length = 0;
  }

  /**
   * Remove entity using swap-delete for O(1) removal
   */
  private removeEntityFromArchetype(archetype: Archetype, entityId: number): void {
    const internal = archetype as ArchetypeInternal;
    const entityIndices = internal.getInternalEntityIndices();
    const indicesMap = internal.getInternalIndicesMap();
    const buffers = internal.getInternalBuffers();

    const index = entityIndices.get(entityId);
    if (index === undefined) return;

    const lastIndex = internal.getInternalCount() - 1;

    if (index !== lastIndex) {
      const lastEntityId = indicesMap.get(lastIndex);
      if (lastEntityId !== undefined) {
        entityIndices.set(lastEntityId, index);
        indicesMap.set(index, lastEntityId);

        for (const [_name, buffer] of buffers) {
          buffer[index] = buffer[lastIndex];
        }
      }
    }

    entityIndices.delete(entityId);
    indicesMap.delete(lastIndex);
    internal.setInternalCount(lastIndex);
    this.entityArchetypes.delete(entityId);
  }

  getPendingCount(): number {
    return this.pendingDeletions.length;
  }

  peekPendingDeletions(): readonly number[] {
    return this.pendingDeletions;
  }
}

export type MotionStatusListener = (params: {
  world: World;
  entityId: number;
  prevStatus?: number;
  nextStatus: number;
}) => void;

export class World {
  readonly registry = new ComponentRegistry();
  readonly entityManager = new EntityManager();
  readonly scheduler = new SystemScheduler();
  config: MotionAppConfig;
  private activeMotionEntityCount = 0;
  private motionStatusListeners?: Set<MotionStatusListener>;

  // Map Archetype ID (string signature) to Archetype instance
  private archetypes = new Map<string, Archetype>();

  // Map Entity ID to Archetype
  private entityArchetypes = new Map<number, Archetype>();

  // Burst manager for batch operations
  private burstManager: BurstManager;

  private static worldCounter = 0;

  constructor(config?: MotionAppConfig) {
    this.burstManager = new BurstManager(this.entityManager, this.entityArchetypes);
    // Assign a unique ID namespace to this world to avoid cross-world collisions
    const namespaceOffset = World.worldCounter++ * 1_000_000;
    this.entityManager.setOffset(namespaceOffset);

    this.config = World.normalizeConfig(config);
  }

  addMotionStatusListener(listener: MotionStatusListener): void {
    if (!this.motionStatusListeners) {
      this.motionStatusListeners = new Set();
    }
    this.motionStatusListeners.add(listener);
  }

  removeMotionStatusListener(listener: MotionStatusListener): void {
    this.motionStatusListeners?.delete(listener);
  }

  private static normalizeConfig(config?: MotionAppConfig): MotionAppConfig {
    if (config?.gpuCompute && !['auto', 'always', 'never'].includes(config.gpuCompute)) {
      throw new MotionError(
        `Invalid gpuCompute mode: ${config.gpuCompute}. Must be 'auto', 'always', or 'never'.`,
        ErrorCode.INVALID_GPU_MODE,
        ErrorSeverity.FATAL,
        { providedMode: config.gpuCompute },
      );
    }

    return {
      // GPU-First: Default to 'always' - GPU is preferred, CPU fallback automatic
      gpuCompute: 'always',
      gpuEasing: true,
      ...config,
    };
  }

  static create(config?: MotionAppConfig): World {
    return new World(config);
  }

  setConfig(config?: MotionAppConfig): void {
    this.config = World.normalizeConfig(config);
  }

  resetState(): void {
    this.archetypes.clear();
    this.entityArchetypes.clear();
    this.entityManager.clear();
    this.burstManager = new BurstManager(this.entityManager, this.entityArchetypes);
    this.activeMotionEntityCount = 0;
    this.scheduler.setActiveEntityCount(0);
  }

  getActiveMotionEntityCount(): number {
    return this.activeMotionEntityCount;
  }

  setMotionStatus(entityId: number, nextStatus: number): void {
    const archetype = this.entityArchetypes.get(entityId);
    if (!archetype) return;
    const internal = archetype as ArchetypeInternal;
    const index = internal.getInternalEntityIndices().get(entityId);
    if (index === undefined) return;
    this.setMotionStatusAt(archetype, index, nextStatus);
  }

  setMotionStatusAt(archetype: Archetype, index: number, nextStatus: number): void {
    const stateBuffer = archetype.getBuffer('MotionState');
    if (!stateBuffer) return;
    const state = stateBuffer[index] as { status?: number };
    const prevStatus = typeof state?.status === 'number' ? state.status : undefined;
    state.status = nextStatus;
    const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
    if (typedStatus) typedStatus[index] = nextStatus;
    this.applyActiveMotionDelta(prevStatus, nextStatus);
    if (this.motionStatusListeners && prevStatus !== nextStatus) {
      const internal = archetype as ArchetypeInternal;
      const indicesMap = internal.getInternalIndicesMap();
      const entityId = indicesMap.get(index);
      if (entityId !== undefined) {
        for (const listener of this.motionStatusListeners) {
          listener({
            world: this,
            entityId,
            prevStatus,
            nextStatus,
          });
        }
      }
    }
  }

  private isActiveMotionStatus(status: number | undefined): boolean {
    return status === 1 || status === 2;
  }

  private applyActiveMotionDelta(prevStatus: number | undefined, nextStatus: number): void {
    const wasActive = this.isActiveMotionStatus(prevStatus);
    const isActive = this.isActiveMotionStatus(nextStatus);
    if (wasActive === isActive) return;
    this.activeMotionEntityCount += isActive ? 1 : -1;
    if (!Number.isFinite(this.activeMotionEntityCount) || this.activeMotionEntityCount < 0) {
      this.activeMotionEntityCount = 0;
    }
    this.scheduler.setActiveEntityCount(this.activeMotionEntityCount);
  }

  dispose(): void {
    this.scheduler.stop();
  }

  getArchetype(componentNames: string[]): Archetype {
    const sorted = componentNames.slice().sort().join('|');
    let arch = this.archetypes.get(sorted);
    if (!arch) {
      const defs = new Map();
      for (const name of componentNames) {
        const def = this.registry.get(name);
        if (!def) {
          throw new MotionError(
            `Component ${name} not registered`,
            ErrorCode.COMPONENT_NOT_REGISTERED,
            ErrorSeverity.FATAL,
            { componentName: name },
          );
        }
        defs.set(name, def);
      }
      arch = new Archetype(sorted, defs);
      this.archetypes.set(sorted, arch);
    }
    return arch;
  }

  getEntityArchetype(id: number): Archetype | undefined {
    return this.entityArchetypes.get(id);
  }

  getArchetypes(): IterableIterator<Archetype> {
    return this.archetypes.values();
  }

  createEntity(components: ComponentData): number {
    const id = this.entityManager.create();
    const names = Object.keys(components);
    const archetype = this.getArchetype(names);
    archetype.addEntity(id, components);
    this.entityArchetypes.set(id, archetype);

    const motionState = components.MotionState as { status?: number } | undefined;
    if (motionState && typeof motionState.status === 'number') {
      this.applyActiveMotionDelta(undefined, motionState.status);
    }

    return id;
  }

  /**
   * Create multiple entities in batch for high-performance scenarios
   * @param componentNames Names of components for all entities
   * @param dataArray Array of component data objects
   * @returns Array of created entity IDs
   */
  createEntitiesBurst(componentNames: string[], dataArray: ComponentData[]): number[] {
    const archetype = this.getArchetype(componentNames);
    const createdIds = this.burstManager.createBatch(archetype, dataArray);
    let delta = 0;
    for (const data of dataArray) {
      const motionState = data.MotionState as { status?: number } | undefined;
      if (motionState && (motionState.status === 1 || motionState.status === 2)) {
        delta++;
      }
    }
    if (delta > 0) {
      this.activeMotionEntityCount += delta;
      this.scheduler.setActiveEntityCount(this.activeMotionEntityCount);
    }
    return createdIds;
  }

  /**
   * Mark entities for deletion with deferred cleanup
   * @param entityIds IDs to delete
   */
  markForDeletion(entityIds: number[]): void {
    this.burstManager.markForDeletion(entityIds);
  }

  /**
   * Process all pending deletions efficiently
   */
  flushDeletions(): void {
    const pending = this.burstManager.peekPendingDeletions();
    if (pending.length > 0) {
      const unique = new Set<number>();
      for (const id of pending) unique.add(id);
      for (const entityId of unique) {
        const archetype = this.entityArchetypes.get(entityId);
        if (!archetype) continue;
        const internal = archetype as ArchetypeInternal;
        const index = internal.getInternalEntityIndices().get(entityId);
        if (index === undefined) continue;
        const stateBuffer = archetype.getBuffer('MotionState');
        if (!stateBuffer) continue;
        const state = stateBuffer[index] as { status?: number };
        const status = typeof state?.status === 'number' ? state.status : undefined;
        if (this.isActiveMotionStatus(status)) {
          this.applyActiveMotionDelta(status, 0);
        }
      }
    }
    this.burstManager.flushDeletions();
  }

  /**
   * Get pending deletion count
   */
  getPendingDeletions(): number {
    return this.burstManager.getPendingCount();
  }
}
