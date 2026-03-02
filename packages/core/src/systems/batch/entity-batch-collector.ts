import type { BatchEntity, BatchKeyframe, BatchMetadata } from './types';
import { createDebugger, panic } from '@g-motion/shared';
import type { BatchStatistics } from './batch-statistics';

const warn = createDebugger('BatchCollector', 'warn');

export class EntityBatchCollector {
  private entityBatches: Map<string, BatchEntity[]> = new Map();
  private keyframeBatches: Map<string, BatchKeyframe[]> = new Map();

  constructor(
    private maxBatchSize: number,
    private stats: BatchStatistics,
  ) {}

  createBatch(batchId: string, entities: BatchEntity[]): BatchMetadata {
    if (entities.length === 0) {
      panic('Cannot create batch with zero entities', { batchId });
    }

    this.entityBatches.set(batchId, entities);
    this.stats.onLegacyBatchCreated(entities.length);

    return {
      batchId,
      entityCount: entities.length,
      createdAt: Date.now(),
    };
  }

  addKeyframes(batchId: string, keyframes: BatchKeyframe[]): boolean {
    if (!this.entityBatches.has(batchId)) {
      warn(`Batch '${batchId}' not found`, { batchId });
      return false;
    }

    this.keyframeBatches.set(batchId, keyframes);
    return true;
  }

  getBatchSize(batchId: string): number {
    return this.entityBatches.get(batchId)?.length || 0;
  }

  clearBatch(batchId: string): boolean {
    const removed = this.entityBatches.delete(batchId);
    this.keyframeBatches.delete(batchId);
    return removed;
  }

  getAllBatchIds(): string[] {
    return Array.from(this.entityBatches.keys());
  }

  validateBatch(batchId: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const entities = this.entityBatches.get(batchId);
    if (!entities) {
      const message = `Batch '${batchId}' not found`;
      errors.push(message);
      panic(message, { batchId });
    }

    const keyframes = this.keyframeBatches.get(batchId);
    if (!keyframes) {
      errors.push(`Keyframes for batch '${batchId}' not found`);
    } else if (keyframes.length !== entities.length) {
      errors.push(
        `Entity count (${entities.length}) does not match keyframe count (${keyframes.length})`,
      );
    }

    if (errors.length > 0) {
      panic('Batch validation failed', {
        batchId,
        entityCount: entities.length,
        keyframeCount: this.keyframeBatches.get(batchId)?.length ?? 0,
        maxBatchSize: this.maxBatchSize,
        errors: [...errors],
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  clear(): void {
    this.entityBatches.clear();
    this.keyframeBatches.clear();
  }

  getEntities(batchId: string): BatchEntity[] | undefined {
    return this.entityBatches.get(batchId);
  }

  getKeyframes(batchId: string): BatchKeyframe[] | undefined {
    return this.keyframeBatches.get(batchId);
  }
}
