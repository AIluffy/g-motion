import type { BatchEntity, BatchKeyframe, BatchMetadata } from './types';
import { ErrorCode, ErrorSeverity, MotionError } from '@g-motion/shared';
import { getErrorHandler } from '../../context';
import type { BatchStatistics } from './batchStatistics';

export class EntityBatchCollector {
  private entityBatches: Map<string, BatchEntity[]> = new Map();
  private keyframeBatches: Map<string, BatchKeyframe[]> = new Map();

  constructor(
    private maxBatchSize: number,
    private stats: BatchStatistics,
  ) {}

  createBatch(batchId: string, entities: BatchEntity[]): BatchMetadata {
    if (entities.length === 0) {
      throw new MotionError(
        'Cannot create batch with zero entities',
        ErrorCode.BATCH_EMPTY,
        ErrorSeverity.FATAL,
        { batchId },
      );
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
      try {
        getErrorHandler().create(
          `Batch '${batchId}' not found`,
          ErrorCode.BATCH_NOT_FOUND,
          ErrorSeverity.WARNING,
          { batchId },
        );
      } catch {}
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
      try {
        getErrorHandler().create(message, ErrorCode.BATCH_NOT_FOUND, ErrorSeverity.FATAL, {
          batchId,
        });
      } catch {}
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

    if (errors.length > 0) {
      try {
        getErrorHandler().create(
          'Batch validation failed',
          ErrorCode.BATCH_VALIDATION_FAILED,
          ErrorSeverity.FATAL,
          {
            batchId,
            entityCount: entities.length,
            keyframeCount: this.keyframeBatches.get(batchId)?.length ?? 0,
            maxBatchSize: this.maxBatchSize,
            errors: [...errors],
          },
        );
      } catch {}
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
