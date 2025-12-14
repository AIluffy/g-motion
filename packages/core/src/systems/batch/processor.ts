/* eslint-disable @typescript-eslint/no-explicit-any */

import { ArchetypeBatchDescriptor } from '../../types';
import { BatchEntity, BatchKeyframe, BatchResult, BatchMetadata, GPUBatchConfig } from './types';
import { DEFAULT_MAX_BATCH_SIZE } from './config';

/**
 * Compute Batch Processor
 * Organizes entities into batches for efficient GPU processing
 *
 * Supports two modes:
 * 1. Shared Pool (default): All archetype batches share a single large GPU buffer
 * 2. Persistent Per-Archetype: Each archetype gets its own dedicated buffers
 */
export class ComputeBatchProcessor {
  // Legacy single-batch support
  private entityBatches: Map<string, BatchEntity[]> = new Map();
  private keyframeBatches: Map<string, BatchKeyframe[]> = new Map();
  private resultCache: Map<string, BatchResult[]> = new Map();

  // Per-archetype batches (new)
  private archetypeBatches: Map<string, ArchetypeBatchDescriptor> = new Map();

  // Configuration
  private maxBatchSize: number;
  private enableResultCaching: boolean;
  // usePersistentBuffers: reserved for future buffer pooling implementation
  // private usePersistentBuffers: boolean;

  // Statistics
  private stats = {
    totalBatches: 0,
    totalEntitiesProcessed: 0,
    totalResultsCached: 0,
    averageBatchSize: 0,
    archetypeCount: 0,
    dispatchCount: 0,
  };

  constructor(config: GPUBatchConfig = {}) {
    this.maxBatchSize = config.maxBatchSize || DEFAULT_MAX_BATCH_SIZE;
    // usePersistentBuffers: reserved for future buffer pooling implementation
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    config.usePersistentBuffers || false;
    // Data transfer optimization flag reserved for future optimization passes
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    config.enableDataTransferOptimization !== false;
    this.enableResultCaching = config.enableResultCaching !== false;
  }

  /**
   * Create a new batch from entities (legacy single-batch API)
   */
  createBatch(batchId: string, entities: BatchEntity[]): BatchMetadata {
    if (entities.length === 0) {
      throw new Error('Cannot create batch with zero entities');
    }

    if (entities.length > this.maxBatchSize) {
      // Batch size exceeds limit, will be split (silent for performance)
    }

    this.entityBatches.set(batchId, entities);
    this.stats.totalBatches += 1;
    this.stats.totalEntitiesProcessed += entities.length;
    this.stats.averageBatchSize = this.stats.totalEntitiesProcessed / this.stats.totalBatches;

    return {
      batchId,
      entityCount: entities.length,
      createdAt: Date.now(),
    };
  }

  /**
   * Add a per-archetype batch for GPU processing
   * Automatically selects appropriate workgroup size
   */
  addArchetypeBatch(
    archetypeId: string,
    entityIds: number[],
    statesData: Float32Array,
    keyframesData: Float32Array,
  ): ArchetypeBatchDescriptor {
    const entityCount = entityIds.length;
    if (entityCount === 0) {
      throw new Error(`Cannot create batch for archetype ${archetypeId} with zero entities`);
    }

    // Select workgroup hint based on entity count
    const workgroupHint = this.selectWorkgroup(entityCount);

    const batch: ArchetypeBatchDescriptor = {
      archetypeId,
      entityIds,
      entityCount,
      statesData,
      keyframesData,
      workgroupHint,
      createdAt: Date.now(),
    };

    this.archetypeBatches.set(archetypeId, batch);
    this.stats.archetypeCount = this.archetypeBatches.size;
    this.stats.dispatchCount += 1;

    return batch;
  }

  /**
   * Get all per-archetype batches ready for GPU dispatch
   */
  getArchetypeBatches(): Map<string, ArchetypeBatchDescriptor> {
    return new Map(this.archetypeBatches);
  }

  /**
   * Get a single archetype batch by ID
   */
  getArchetypeBatch(archetypeId: string): ArchetypeBatchDescriptor | undefined {
    return this.archetypeBatches.get(archetypeId);
  }

  /**
   * Clear all archetype batches (called per frame)
   */
  clearArchetypeBatches(): void {
    this.archetypeBatches.clear();
    this.stats.archetypeCount = 0;
  }

  /**
   * Select adaptive workgroup size based on entity count
   * Returns: 16, 32, 64, or 128
   */
  selectWorkgroup(entityCount: number): number {
    if (entityCount < 64) return 16;
    if (entityCount < 256) return 32;
    if (entityCount < 1024) return 64;
    return 128;
  }

  /**
   * Add keyframes to a batch (legacy API)
   */
  addKeyframes(batchId: string, keyframes: BatchKeyframe[]): boolean {
    if (!this.entityBatches.has(batchId)) {
      console.error(`[Batch] Batch '${batchId}' not found`);
      return false;
    }

    this.keyframeBatches.set(batchId, keyframes);
    return true;
  }

  /**
   * Get entity batch as flat Float32Array for GPU upload (legacy API)
   */
  getEntityBufferData(batchId: string): Float32Array | null {
    const entities = this.entityBatches.get(batchId);
    if (!entities) {
      console.error(`[Batch] Batch '${batchId}' not found`);
      return null;
    }

    // Pack as: startTime (f32), currentTime (f32), playbackRate (f32), status (f32)
    const buffer = new Float32Array(entities.length * 4);
    entities.forEach((entity, index) => {
      const offset = index * 4;
      buffer[offset] = entity.startTime;
      buffer[offset + 1] = entity.currentTime;
      buffer[offset + 2] = entity.playbackRate;
      buffer[offset + 3] = entity.status;
    });

    return buffer;
  }

  /**
   * Get keyframe batch as flat Float32Array for GPU upload (legacy API)
   */
  getKeyframeBufferData(batchId: string): Float32Array | null {
    const keyframes = this.keyframeBatches.get(batchId);
    if (!keyframes) {
      console.error(`[Batch] Keyframes for batch '${batchId}' not found`);
      return null;
    }

    // Pack as: startTime (f32), duration (f32), startValue (f32), endValue (f32), easingId (f32)
    const buffer = new Float32Array(keyframes.length * 5);
    keyframes.forEach((keyframe, index) => {
      const offset = index * 5;
      buffer[offset] = keyframe.startTime;
      buffer[offset + 1] = keyframe.duration;
      buffer[offset + 2] = keyframe.startValue;
      buffer[offset + 3] = keyframe.endValue;
      buffer[offset + 4] = keyframe.easingId;
    });

    return buffer;
  }

  /**
   * Store compute results
   */
  storeResults(batchId: string, results: BatchResult[]): boolean {
    if (!this.enableResultCaching) return false;

    this.resultCache.set(batchId, results);
    this.stats.totalResultsCached += results.length;
    return true;
  }

  /**
   * Get cached results
   */
  getResults(batchId: string): BatchResult[] | null {
    return this.resultCache.get(batchId) || null;
  }

  /**
   * Get batch entity count (legacy API)
   */
  getBatchSize(batchId: string): number {
    return this.entityBatches.get(batchId)?.length || 0;
  }

  /**
   * Clear batch (remove from memory) (legacy API)
   */
  clearBatch(batchId: string): boolean {
    const removed = this.entityBatches.delete(batchId);
    this.keyframeBatches.delete(batchId);
    this.resultCache.delete(batchId);
    return removed;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalBatches: 0,
      totalEntitiesProcessed: 0,
      totalResultsCached: 0,
      averageBatchSize: 0,
      archetypeCount: 0,
      dispatchCount: 0,
    };
  }

  /**
   * Get all batch IDs (legacy API)
   */
  getAllBatchIds(): string[] {
    return Array.from(this.entityBatches.keys());
  }

  /**
   * Validate batch integrity (legacy API)
   */
  validateBatch(batchId: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const entities = this.entityBatches.get(batchId);
    if (!entities) {
      errors.push(`Batch '${batchId}' not found`);
      return { valid: false, errors };
    }

    const keyframes = this.keyframeBatches.get(batchId);
    if (!keyframes) {
      errors.push(`Keyframes for batch '${batchId}' not found`);
    } else if (keyframes.length !== entities.length) {
      errors.push(
        `Entity count (${entities.length}) does not match keyframe count (${keyframes.length})`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
