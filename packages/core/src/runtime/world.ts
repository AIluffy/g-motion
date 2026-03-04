import { ComponentRegistry } from '../ecs/registry';
import { EntityManager } from '../ecs/entities';
import { SystemScheduler } from '../scheduler/scheduler';
import type { Archetype } from '../ecs/archetype';
import type { ComponentValue } from '@g-motion/shared';
import type { MotionAppConfig, NormalizedMotionAppConfig } from './plugin';
import { normalizeConfig } from './plugin';
import { ArchetypeManager, type MotionStatusCoordinator } from '../ecs/archetypes';
import { SystemCoordinator } from './status';

/**
 * Component data type
 */
type ComponentData = Record<string, ComponentValue | undefined>;

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
  private _config: NormalizedMotionAppConfig;
  private systemCoordinator: SystemCoordinator;
  private archetypeManager: ArchetypeManager;

  private static worldCounter = 0;

  constructor(config?: MotionAppConfig) {
    // Assign a unique ID namespace to this world to avoid cross-world collisions
    const namespaceOffset = World.worldCounter++ * 1_000_000;
    this.entityManager.setOffset(namespaceOffset);

    this._config = normalizeConfig(config ?? {});

    let systems: SystemCoordinator | undefined;
    const motion: MotionStatusCoordinator = {
      isActiveMotionStatus: (status) => systems?.isActiveMotionStatus(status) ?? false,
      onMotionStatusChange: (prevStatus, nextStatus) => {
        systems?.onMotionStatusChange(prevStatus, nextStatus);
      },
      adjustActiveMotionEntityCount: (delta) => {
        systems?.adjustActiveMotionEntityCount(delta);
      },
    };
    this.archetypeManager = new ArchetypeManager(this.registry, this.entityManager, motion);
    systems = new SystemCoordinator(this, this.scheduler, this.archetypeManager);
    this.systemCoordinator = systems;
  }

  static create(config?: MotionAppConfig): World {
    return new World(config);
  }

  get config(): NormalizedMotionAppConfig {
    return this._config;
  }

  setConfig(config?: MotionAppConfig): void {
    this._config = normalizeConfig(config ?? {});
  }

  resetState(): void {
    this.archetypeManager.reset();
    this.entityManager.clear();
    this.systemCoordinator.reset();
  }

  getActiveMotionEntityCount(): number {
    return this.systemCoordinator.getActiveMotionEntityCount();
  }

  addMotionStatusListener(listener: MotionStatusListener): void {
    this.systemCoordinator.addMotionStatusListener(listener);
  }

  removeMotionStatusListener(listener: MotionStatusListener): void {
    this.systemCoordinator.removeMotionStatusListener(listener);
  }

  setMotionStatus(entityId: number, nextStatus: number): void {
    this.systemCoordinator.setMotionStatus(entityId, nextStatus);
  }

  setMotionStatusAt(archetype: Archetype, index: number, nextStatus: number): void {
    this.systemCoordinator.setMotionStatusAt(archetype, index, nextStatus);
  }

  dispose(): void {
    this.systemCoordinator.dispose();
  }

  getArchetype(componentNames: string[], id?: string): Archetype {
    return this.archetypeManager.getArchetype(componentNames, id);
  }

  getEntityArchetype(id: number): Archetype | undefined {
    return this.archetypeManager.getEntityArchetype(id);
  }

  getArchetypes(): IterableIterator<Archetype> {
    return this.archetypeManager.getArchetypes();
  }

  createEntity(components: ComponentData): number {
    return this.archetypeManager.createEntity(components);
  }

  /**
   * Create multiple entities in batch for high-performance scenarios
   * @param componentNames Names of components for all entities
   * @param dataArray Array of component data objects
   * @returns Array of created entity IDs
   */
  createEntitiesBurst(componentNames: string[], dataArray: ComponentData[]): number[] {
    return this.archetypeManager.createEntitiesBurst(componentNames, dataArray);
  }

  /**
   * Mark entities for deletion with deferred cleanup
   * @param entityIds IDs to delete
   */
  markForDeletion(entityIds: number[]): void {
    this.archetypeManager.markForDeletion(entityIds);
  }

  /**
   * Process all pending deletions efficiently
   */
  flushDeletions(): void {
    this.archetypeManager.flushDeletions();
  }

  /**
   * Get pending deletion count
   */
  getPendingDeletions(): number {
    return this.archetypeManager.getPendingDeletions();
  }
}
