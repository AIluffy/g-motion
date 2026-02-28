import type { ComponentRegistry } from './registry';
import type { EntityManager } from './entity';
import { Archetype, ArchetypeInternal, type ComponentValue } from './archetype';
import { ARCHETYPE_DEFAULTS } from './constants';
import { ErrorCode, ErrorSeverity, MotionError } from '@g-motion/shared';
import type { ComponentDef } from './plugin';

type ComponentData = Record<string, ComponentValue | undefined>;

export interface MotionStatusCoordinator {
  isActiveMotionStatus(status: number | undefined): boolean;
  onMotionStatusChange(prevStatus: number | undefined, nextStatus: number): void;
  adjustActiveMotionEntityCount(delta: number): void;
}

class BurstManager {
  private pendingDeletions: number[] = [];

  constructor(
    private entityManager: EntityManager,
    private entityArchetypes: Map<number, Archetype>,
  ) {}

  reserveCapacity(archetype: Archetype, totalSize: number): void {
    const internal: ArchetypeInternal = archetype;
    const current = archetype.entityCount;
    if (current >= totalSize) return;

    let capacity = internal.getInternalCapacity();
    while (capacity < totalSize) {
      capacity *= ARCHETYPE_DEFAULTS.GROWTH_FACTOR;
    }

    if (capacity !== internal.getInternalCapacity()) {
      internal.resize(capacity);
    }
  }

  createBatch(archetype: Archetype, dataArray: ComponentData[]): number[] {
    const count = dataArray.length;
    const createdIds = new Array<number>(count);

    this.reserveCapacity(archetype, archetype.entityCount + count);

    for (let i = 0; i < count; i++) {
      const data = dataArray[i]!;
      const entityId = this.entityManager.create();
      archetype.addEntity(entityId, data);
      this.entityArchetypes.set(entityId, archetype);
      createdIds[i] = entityId;
    }

    return createdIds;
  }

  markForDeletion(entityIds: number[]): void {
    const pending = this.pendingDeletions;
    const start = pending.length;
    const addCount = entityIds.length;
    pending.length = start + addCount;
    for (let i = 0; i < addCount; i++) {
      pending[start + i] = entityIds[i]!;
    }
  }

  flushDeletions(): void {
    if (this.pendingDeletions.length === 0) return;

    const byArchetype = new Map<Archetype, number[]>();
    for (const entityId of this.pendingDeletions) {
      const archetype = this.entityArchetypes.get(entityId);
      if (!archetype) continue;
      let ids = byArchetype.get(archetype);
      if (!ids) {
        ids = [];
        byArchetype.set(archetype, ids);
      }
      ids[ids.length] = entityId;
    }

    for (const [archetype, entityIds] of byArchetype) {
      const internal: ArchetypeInternal = archetype;
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

  private removeEntityFromArchetype(archetype: Archetype, entityId: number): void {
    const internal: ArchetypeInternal = archetype;
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
    this.entityManager.destroy(entityId);
  }

  getPendingCount(): number {
    return this.pendingDeletions.length;
  }

  peekPendingDeletions(): readonly number[] {
    return this.pendingDeletions;
  }
}

export class ArchetypeManager {
  private archetypes = new Map<string, Archetype>();
  private entityArchetypes = new Map<number, Archetype>();
  private burstManager: BurstManager;

  constructor(
    private registry: ComponentRegistry,
    private entityManager: EntityManager,
    private motion: MotionStatusCoordinator,
  ) {
    this.burstManager = new BurstManager(this.entityManager, this.entityArchetypes);
  }

  reset(): void {
    this.archetypes.clear();
    this.entityArchetypes.clear();
    this.burstManager = new BurstManager(this.entityManager, this.entityArchetypes);
  }

  getArchetype(componentNames: string[], id?: string): Archetype {
    const sortedNames = componentNames.slice().sort();
    const archetypeId = id ?? sortedNames.join('|');
    let arch = this.archetypes.get(archetypeId);
    if (!arch) {
      const defs = new Map<string, ComponentDef>();
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
      arch = new Archetype(archetypeId, defs);
      this.archetypes.set(archetypeId, arch);
    }
    return arch;
  }

  getEntityArchetype(id: number): Archetype | undefined {
    return this.entityArchetypes.get(id);
  }

  getArchetypes(): IterableIterator<Archetype> {
    return this.archetypes.values();
  }

  getEntityLocation(entityId: number): { archetype: Archetype; index: number } | null {
    const archetype = this.entityArchetypes.get(entityId);
    if (!archetype) return null;
    const index = archetype.getInternalEntityIndices().get(entityId);
    if (index === undefined) return null;
    return { archetype, index };
  }

  createEntity(components: ComponentData): number {
    const id = this.entityManager.create();
    const names = Object.keys(components);
    const archetype = this.getArchetype(names, this.getArchetypeIdOverride(names, components));
    archetype.addEntity(id, components);
    this.entityArchetypes.set(id, archetype);

    const status = this.getMotionStatus(components.MotionState);
    if (status !== undefined) {
      this.motion.onMotionStatusChange(undefined, status);
    }

    return id;
  }

  createEntitiesBurst(componentNames: string[], dataArray: ComponentData[]): number[] {
    const archetype = this.getArchetype(componentNames);
    const createdIds = this.burstManager.createBatch(archetype, dataArray);

    let delta = 0;
    for (const data of dataArray) {
      const status = this.getMotionStatus(data.MotionState);
      if (this.motion.isActiveMotionStatus(status)) {
        delta++;
      }
    }
    if (delta > 0) {
      this.motion.adjustActiveMotionEntityCount(delta);
    }

    return createdIds;
  }

  markForDeletion(entityIds: number[]): void {
    this.burstManager.markForDeletion(entityIds);
  }

  flushDeletions(): void {
    const pending = this.burstManager.peekPendingDeletions();
    if (pending.length > 0) {
      const unique = new Set<number>();
      for (const id of pending) unique.add(id);
      for (const entityId of unique) {
        const archetype = this.entityArchetypes.get(entityId);
        if (!archetype) continue;
        const index = archetype.getInternalEntityIndices().get(entityId);
        if (index === undefined) continue;
        const stateBuffer = archetype.getBuffer('MotionState');
        if (!stateBuffer) continue;
        const status = this.getMotionStatus(stateBuffer[index] as ComponentValue | undefined);
        if (this.motion.isActiveMotionStatus(status)) {
          this.motion.onMotionStatusChange(status, 0);
        }
      }
    }
    this.burstManager.flushDeletions();
  }

  getPendingDeletions(): number {
    return this.burstManager.getPendingCount();
  }

  private getArchetypeIdOverride(names: string[], components: ComponentData): string | undefined {
    const render = components.Render as { rendererId?: string } | undefined;
    if (render && typeof render.rendererId === 'string') {
      const sortedNames = names.slice().sort();
      return `${sortedNames.join('|')}::${render.rendererId}`;
    }
    return undefined;
  }

  private getMotionStatus(motionState: ComponentValue | undefined): number | undefined {
    if (!motionState || typeof motionState !== 'object') return undefined;
    const maybeStatus = (motionState as { status?: unknown }).status;
    return typeof maybeStatus === 'number' ? maybeStatus : undefined;
  }
}
