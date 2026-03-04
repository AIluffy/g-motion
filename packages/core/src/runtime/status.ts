import type { Archetype } from '../ecs/archetype';
import { ArchetypeInternal } from '../ecs/archetype';
import type { SystemScheduler } from '../scheduler/scheduler';
import type { ArchetypeManager } from '../ecs/archetypes';
import type { MotionStatusListener, World } from './world';

export class SystemCoordinator {
  private activeMotionEntityCount = 0;
  private motionStatusListeners?: Set<MotionStatusListener>;

  constructor(
    private world: World,
    readonly scheduler: SystemScheduler,
    private archetypes: ArchetypeManager,
  ) {}

  reset(): void {
    this.activeMotionEntityCount = 0;
    this.scheduler.setActiveEntityCount(0);
  }

  dispose(): void {
    this.scheduler.stop();
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

  getActiveMotionEntityCount(): number {
    return this.activeMotionEntityCount;
  }

  setMotionStatus(entityId: number, nextStatus: number): void {
    const location = this.archetypes.getEntityLocation(entityId);
    if (!location) return;
    this.setMotionStatusAt(location.archetype, location.index, nextStatus);
  }

  setMotionStatusAt(archetype: Archetype, index: number, nextStatus: number): void {
    const stateBuffer = archetype.getBuffer('MotionState');
    if (!stateBuffer) return;
    const state = stateBuffer[index] as { status?: number };
    const prevStatus = typeof state?.status === 'number' ? state.status : undefined;
    state.status = nextStatus;
    const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
    if (typedStatus) typedStatus[index] = nextStatus;
    this.onMotionStatusChange(prevStatus, nextStatus);
    if (this.motionStatusListeners && prevStatus !== nextStatus) {
      const internal = archetype as ArchetypeInternal;
      const indicesMap = internal.getInternalIndicesMap();
      const entityId = indicesMap.get(index);
      if (entityId !== undefined) {
        for (const listener of this.motionStatusListeners) {
          listener({
            world: this.world,
            entityId,
            prevStatus,
            nextStatus,
          });
        }
      }
    }
  }

  isActiveMotionStatus(status: number | undefined): boolean {
    return status === 1 || status === 2;
  }

  onMotionStatusChange(prevStatus: number | undefined, nextStatus: number): void {
    const wasActive = this.isActiveMotionStatus(prevStatus);
    const isActive = this.isActiveMotionStatus(nextStatus);
    if (wasActive === isActive) return;
    this.activeMotionEntityCount += isActive ? 1 : -1;
    if (!Number.isFinite(this.activeMotionEntityCount) || this.activeMotionEntityCount < 0) {
      this.activeMotionEntityCount = 0;
    }
    this.scheduler.setActiveEntityCount(this.activeMotionEntityCount);
  }

  adjustActiveMotionEntityCount(delta: number): void {
    if (delta === 0) return;
    this.activeMotionEntityCount += delta;
    if (!Number.isFinite(this.activeMotionEntityCount) || this.activeMotionEntityCount < 0) {
      this.activeMotionEntityCount = 0;
    }
    this.scheduler.setActiveEntityCount(this.activeMotionEntityCount);
  }
}
