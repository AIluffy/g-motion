import { ComponentRegistry } from './registry';
import { EntityManager } from './entity';
import { SystemScheduler } from './scheduler';
import { Archetype } from './archetype';
import { MotionAppConfig } from './plugin';

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
    const current = archetype.entityCount;
    if (current >= totalSize) return;

    let capacity = (archetype as any).capacity ?? 1024;
    while (capacity < totalSize) {
      capacity *= 2;
    }

    if (capacity !== (archetype as any).capacity) {
      (archetype as any).resize(capacity);
    }
  }

  /**
   * Create multiple entities in one batch with pre-allocation
   */
  createBatch(archetype: Archetype, dataArray: Record<string, any>[]): number[] {
    const count = dataArray.length;
    const createdIds: number[] = [];

    // Pre-allocate once
    this.reserveCapacity(archetype, archetype.entityCount + count);

    // Batch create all entities
    for (const data of dataArray) {
      const entityId = this.entityManager.create();
      (archetype as any).addEntity(entityId, data);
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
      entityIds.sort((a, b) => {
        const indexA = (archetype as any).entityIndices.get(a) ?? -1;
        const indexB = (archetype as any).entityIndices.get(b) ?? -1;
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
    const indices = (archetype as any).entityIndices;
    const reverse = (archetype as any).indicesMap;
    const index = indices.get(entityId);

    if (index === undefined) return;

    const lastIndex = (archetype as any).count - 1;

    if (index !== lastIndex) {
      const lastEntityId = reverse.get(lastIndex);
      if (lastEntityId !== undefined) {
        indices.set(lastEntityId, index);
        reverse.set(index, lastEntityId);

        for (const [_name, buffer] of (archetype as any).buffers) {
          (buffer as any[])[index] = (buffer as any[])[lastIndex];
        }
      }
    }

    indices.delete(entityId);
    reverse.delete(lastIndex);
    (archetype as any).count--;
    this.entityArchetypes.delete(entityId);
  }

  getPendingCount(): number {
    return this.pendingDeletions.length;
  }
}

export class World {
  readonly registry = new ComponentRegistry();
  readonly entityManager = new EntityManager();
  readonly scheduler = new SystemScheduler();
  config: MotionAppConfig = { webgpuThreshold: 1000 };

  // Map Archetype ID (string signature) to Archetype instance
  private archetypes = new Map<string, Archetype>();

  // Map Entity ID to Archetype
  private entityArchetypes = new Map<number, Archetype>();

  // Burst manager for batch operations
  private burstManager: BurstManager;

  private static instance: World;

  private static worldCounter = 0;

  private constructor() {
    this.burstManager = new BurstManager(this.entityManager, this.entityArchetypes);
    // Assign a unique ID namespace to this world to avoid cross-world collisions
    const namespaceOffset = World.worldCounter++ * 1_000_000;
    this.entityManager.setOffset(namespaceOffset);
  }

  static get(config?: MotionAppConfig): World {
    if (!World.instance) {
      World.instance = new World();
      if (config) {
        // Validate gpuCompute mode if provided
        if (config.gpuCompute && !['auto', 'always', 'never'].includes(config.gpuCompute)) {
          throw new Error(
            `Invalid gpuCompute mode: ${config.gpuCompute}. Must be 'auto', 'always', or 'never'.`,
          );
        }

        World.instance.config = {
          webgpuThreshold: 1000,
          gpuCompute: 'auto',
          gpuEasing: true,
          ...config,
        };
      } else {
        World.instance.config = {
          webgpuThreshold: 1000,
          gpuCompute: 'auto',
          gpuEasing: true,
        };
      }
      // Don't auto-start scheduler - it will start when first entity is created
    }
    return World.instance;
  }

  getArchetype(componentNames: string[]): Archetype {
    const sorted = componentNames.slice().sort().join('|');
    let arch = this.archetypes.get(sorted);
    if (!arch) {
      const defs = new Map();
      for (const name of componentNames) {
        const def = this.registry.get(name);
        if (!def) throw new Error(`Component ${name} not registered`);
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

  createEntity(components: Record<string, any>): number {
    const id = this.entityManager.create();
    const names = Object.keys(components);
    const archetype = this.getArchetype(names);
    archetype.addEntity(id, components);
    this.entityArchetypes.set(id, archetype);
    return id;
  }

  /**
   * Create multiple entities in batch for high-performance scenarios
   * @param componentNames Names of components for all entities
   * @param dataArray Array of component data objects
   * @returns Array of created entity IDs
   */
  createEntitiesBurst(componentNames: string[], dataArray: Record<string, any>[]): number[] {
    const archetype = this.getArchetype(componentNames);
    return this.burstManager.createBatch(archetype, dataArray);
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
    this.burstManager.flushDeletions();
  }

  /**
   * Get pending deletion count
   */
  getPendingDeletions(): number {
    return this.burstManager.getPendingCount();
  }
}
