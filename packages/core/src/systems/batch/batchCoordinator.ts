import type {
  ArchetypeBatchDescriptor,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
} from '../../types';
import type {
  BatchEntity,
  BatchKeyframe,
  BatchResult,
  BatchMetadata,
  GPUBatchConfig,
} from './types';
import { DEFAULT_MAX_BATCH_SIZE } from './config';
import { BatchStatistics } from './batchStatistics';
import { CPUBatchFallback } from './cpuBatchFallback';
import { EntityBatchCollector } from './entityBatchCollector';
import { EntityIdLeasePool } from './entityIdLeasePool';
import { GPUBatchDispatcher } from './gpuBatchDispatcher';

export class BatchCoordinator {
  private maxBatchSize: number;
  private enableResultCaching: boolean;

  private stats = new BatchStatistics();
  private leasePool = new EntityIdLeasePool();
  private collector: EntityBatchCollector;
  private cpuFallback: CPUBatchFallback;
  private gpuDispatcher: GPUBatchDispatcher;

  constructor(config: GPUBatchConfig = {}) {
    this.maxBatchSize = config.maxBatchSize || DEFAULT_MAX_BATCH_SIZE;
    this.enableResultCaching = config.enableResultCaching !== false;

    this.collector = new EntityBatchCollector(this.maxBatchSize, this.stats);
    this.cpuFallback = new CPUBatchFallback(this.collector, this.stats, this.enableResultCaching);
    this.gpuDispatcher = new GPUBatchDispatcher(this.leasePool, this.stats);
  }

  createBatch(batchId: string, entities: BatchEntity[]): BatchMetadata {
    return this.collector.createBatch(batchId, entities);
  }

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
    return this.gpuDispatcher.addArchetypeBatch(
      archetypeId,
      entityIds,
      entityCount,
      entityIdsLeaseId,
      statesData,
      keyframesData,
      keyframesVersion,
      preprocessedKeyframes,
    );
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
    return this.gpuDispatcher.addPhysicsArchetypeBatch(input);
  }

  acquireEntityIds(minLength: number): { leaseId: number; buffer: Int32Array } {
    return this.leasePool.acquire(minLength);
  }

  markEntityIdsInFlight(leaseId: number): void {
    this.leasePool.markInFlight(leaseId);
  }

  releaseEntityIds(leaseId: number): void {
    this.leasePool.release(leaseId);
  }

  getArchetypeBatches(): Map<string, ArchetypeBatchDescriptor> {
    return this.gpuDispatcher.getArchetypeBatches();
  }

  getArchetypeBatch(archetypeId: string): ArchetypeBatchDescriptor | undefined {
    return this.gpuDispatcher.getArchetypeBatch(archetypeId);
  }

  removeArchetypeBatch(archetypeId: string): boolean {
    return this.gpuDispatcher.removeArchetypeBatch(archetypeId);
  }

  clearArchetypeBatches(): void {
    this.gpuDispatcher.clearArchetypeBatches();
  }

  selectWorkgroup(entityCount: number): number {
    return this.gpuDispatcher.selectWorkgroup(entityCount);
  }

  addKeyframes(batchId: string, keyframes: BatchKeyframe[]): boolean {
    return this.collector.addKeyframes(batchId, keyframes);
  }

  getEntityBufferData(batchId: string): Float32Array | null {
    return this.cpuFallback.getEntityBufferData(batchId);
  }

  getKeyframeBufferData(batchId: string): Float32Array | null {
    return this.cpuFallback.getKeyframeBufferData(batchId);
  }

  storeResults(batchId: string, results: BatchResult[]): boolean {
    return this.cpuFallback.storeResults(batchId, results);
  }

  getResults(batchId: string): BatchResult[] | null {
    return this.cpuFallback.getResults(batchId);
  }

  getBatchSize(batchId: string): number {
    return this.collector.getBatchSize(batchId);
  }

  clearBatch(batchId: string): boolean {
    const removed = this.collector.clearBatch(batchId);
    this.cpuFallback.clearBatch(batchId);
    return removed;
  }

  getStats() {
    return this.stats.getSnapshot();
  }

  resetStats(): void {
    this.stats.reset();
  }

  getAllBatchIds(): string[] {
    return this.collector.getAllBatchIds();
  }

  validateBatch(batchId: string): { valid: boolean; errors: string[] } {
    return this.collector.validateBatch(batchId);
  }

  clear(): void {
    this.collector.clear();
    this.cpuFallback.clear();
    this.gpuDispatcher.clear();
    this.resetStats();
  }
}
