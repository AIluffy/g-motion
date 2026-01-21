import type {
  ArchetypeBatchDescriptor,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
} from '../../types';
import type {
  BatchEntity,
  BatchKeyframe,
  BatchMetadata,
  BatchResult,
  GPUBatchConfig,
} from './types';
import { DEFAULT_MAX_BATCH_SIZE } from './config';
import { BatchStatistics } from './batchStatistics';
import { EntityBatchCollector } from './entityBatchCollector';
import { EntityIdLeasePool } from './entityIdLeasePool';
import { GPUBatchDispatcher } from './gpuBatchDispatcher';

export class BatchCoordinator {
  private maxBatchSize: number;
  private enableResultCaching: boolean;
  private resultCache = new Map<string, BatchResult[]>();
  private entityBufferCache = new Map<string, Float32Array>();
  private keyframeBufferCache = new Map<string, Float32Array>();

  private stats = new BatchStatistics();
  private leasePool = new EntityIdLeasePool();
  private collector: EntityBatchCollector;
  private gpuDispatcher: GPUBatchDispatcher;

  constructor(config: GPUBatchConfig = {}) {
    this.maxBatchSize = config.maxBatchSize || DEFAULT_MAX_BATCH_SIZE;
    this.enableResultCaching = config.enableResultCaching !== false;

    this.collector = new EntityBatchCollector(this.maxBatchSize, this.stats);
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
    const entities = this.collector.getEntities(batchId);
    if (!entities) return null;

    const size = entities.length * 4;
    const existing = this.entityBufferCache.get(batchId);
    const buffer =
      existing && existing.length >= size ? existing : new Float32Array(Math.max(16, size));
    if (buffer !== existing) this.entityBufferCache.set(batchId, buffer);

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const base = i * 4;
      buffer[base] = e.startTime;
      buffer[base + 1] = e.currentTime;
      buffer[base + 2] = e.playbackRate;
      buffer[base + 3] = e.status;
    }

    return buffer.subarray(0, size);
  }

  getKeyframeBufferData(batchId: string): Float32Array | null {
    const keyframes = this.collector.getKeyframes(batchId);
    if (!keyframes) return null;

    const size = keyframes.length * 5;
    const existing = this.keyframeBufferCache.get(batchId);
    const buffer =
      existing && existing.length >= size ? existing : new Float32Array(Math.max(16, size));
    if (buffer !== existing) this.keyframeBufferCache.set(batchId, buffer);

    for (let i = 0; i < keyframes.length; i++) {
      const k = keyframes[i];
      const base = i * 5;
      buffer[base] = k.startTime;
      buffer[base + 1] = k.duration;
      buffer[base + 2] = k.startValue;
      buffer[base + 3] = k.endValue;
      buffer[base + 4] = k.easingId;
    }

    return buffer.subarray(0, size);
  }

  storeResults(batchId: string, results: BatchResult[]): boolean {
    if (!this.enableResultCaching) return false;
    if (!this.collector.getEntities(batchId)) return false;
    this.resultCache.set(batchId, results);
    this.stats.addResultsCached(1);
    return true;
  }

  getResults(batchId: string): BatchResult[] | null {
    return this.resultCache.get(batchId) ?? null;
  }

  getBatchSize(batchId: string): number {
    return this.collector.getBatchSize(batchId);
  }

  clearBatch(batchId: string): boolean {
    const cleared = this.collector.clearBatch(batchId);
    this.resultCache.delete(batchId);
    this.entityBufferCache.delete(batchId);
    this.keyframeBufferCache.delete(batchId);
    return cleared;
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
    this.gpuDispatcher.clear();
    this.resultCache.clear();
    this.entityBufferCache.clear();
    this.keyframeBufferCache.clear();
    this.resetStats();
  }
}
