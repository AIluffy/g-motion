import { panic } from '@g-motion/shared';
import type {
  ArchetypeBatchDescriptor,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
} from '@g-motion/webgpu';
import { selectWorkgroupSize } from '@g-motion/webgpu';
import type { BatchStatistics } from './batchStatistics';
import type { EntityIdLeasePool } from './entityIdLeasePool';

export class GPUBatchDispatcher {
  private archetypeBatches: Map<string, ArchetypeBatchDescriptor> = new Map();

  constructor(
    private leasePool: EntityIdLeasePool,
    private stats: BatchStatistics,
  ) {}

  addArchetypeBatch(
    archetypeId: string,
    entityIds: ArrayLike<number>,
    entityCount: number,
    entityIdsLeaseId: number | undefined,
    statesData: Float32Array,
    keyframesData: Float32Array,
    keyframesVersion?: number,
    preprocessedKeyframes?: {
      rawKeyframesPerEntity: Float32Array[];
      channelMapPerEntity: Uint32Array[];
    },
  ): GPUBatchDescriptor {
    if (entityCount === 0) {
      panic(`Cannot create batch for archetype ${archetypeId} with zero entities`, {
        archetypeId,
        entityCount,
      });
    }

    const workgroupHint = this.selectWorkgroup(entityCount);

    const batch: GPUBatchDescriptor = {
      archetypeId,
      entityIds,
      entityCount,
      entityIdsLeaseId,
      statesData,
      keyframesData,
      keyframesVersion,
      preprocessedKeyframes,
      workgroupHint,
      createdAt: Date.now(),
    };

    this.archetypeBatches.set(archetypeId, batch);
    this.stats.setArchetypeCount(this.archetypeBatches.size);
    this.stats.incrementDispatchCount();

    return batch;
  }

  addPhysicsArchetypeBatch(input: {
    archetypeId: string;
    baseArchetypeId: string;
    entityIds: ArrayLike<number>;
    entityCount: number;
    entityIdsLeaseId: number | undefined;
    channels: Array<{ index: number; property: string }>;
    stride: number;
    slotCount: number;
    workgroupHint?: number;
    stateData?: Float32Array;
    stateVersion?: number;
  }): PhysicsBatchDescriptor {
    const {
      archetypeId,
      baseArchetypeId,
      entityIds,
      entityCount,
      entityIdsLeaseId,
      channels,
      stride,
      slotCount,
      workgroupHint,
      stateData,
      stateVersion,
    } = input;

    if (entityCount === 0 || slotCount === 0) {
      panic(`Cannot create physics batch for archetype ${archetypeId} with zero entities`, {
        archetypeId,
        entityCount,
        slotCount,
      });
    }

    const hint =
      typeof workgroupHint === 'number' ? workgroupHint : this.selectWorkgroup(slotCount);
    const batch: PhysicsBatchDescriptor = {
      archetypeId,
      entityIds,
      entityCount,
      entityIdsLeaseId,
      statesData: new Float32Array(0),
      keyframesData: new Float32Array(0),
      workgroupHint: hint,
      createdAt: Date.now(),
      kind: 'physics',
      physics: {
        baseArchetypeId,
        stride,
        channels,
        slotCount,
        stateData,
        stateVersion,
      },
    };

    this.archetypeBatches.set(archetypeId, batch);
    this.stats.setArchetypeCount(this.archetypeBatches.size);
    this.stats.incrementDispatchCount();

    return batch;
  }

  getArchetypeBatches(): Map<string, ArchetypeBatchDescriptor> {
    return new Map(this.archetypeBatches);
  }

  getArchetypeBatch(archetypeId: string): ArchetypeBatchDescriptor | undefined {
    return this.archetypeBatches.get(archetypeId);
  }

  removeArchetypeBatch(archetypeId: string): boolean {
    const batch = this.archetypeBatches.get(archetypeId);
    if (!batch) return false;

    const leaseId = batch.entityIdsLeaseId;
    if (typeof leaseId === 'number' && !this.leasePool.isInFlight(leaseId)) {
      this.leasePool.release(leaseId);
    }

    const removed = this.archetypeBatches.delete(archetypeId);
    this.stats.setArchetypeCount(this.archetypeBatches.size);
    return removed;
  }

  clearArchetypeBatches(): void {
    for (const batch of this.archetypeBatches.values()) {
      const leaseId = batch.entityIdsLeaseId;
      if (typeof leaseId === 'number' && !this.leasePool.isInFlight(leaseId)) {
        this.leasePool.release(leaseId);
      }
    }
    this.archetypeBatches.clear();
    this.stats.setArchetypeCount(0);
  }

  selectWorkgroup(entityCount: number): number {
    return selectWorkgroupSize(entityCount);
  }

  clear(): void {
    this.archetypeBatches.clear();
  }
}
