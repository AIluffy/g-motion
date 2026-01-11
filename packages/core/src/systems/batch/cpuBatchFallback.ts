import type { BatchResult } from './types';
import type { EntityBatchCollector } from './entityBatchCollector';
import { ErrorCode, ErrorSeverity, MotionError } from '../../errors';
import { getErrorHandler } from '../../context';
import type { BatchStatistics } from './batchStatistics';

export class CPUBatchFallback {
  private resultCache: Map<string, BatchResult[]> = new Map();

  constructor(
    private collector: EntityBatchCollector,
    private stats: BatchStatistics,
    private enableResultCaching: boolean,
  ) {}

  getEntityBufferData(batchId: string): Float32Array | null {
    const entities = this.collector.getEntities(batchId);
    if (!entities) {
      try {
        const error = new MotionError(
          `Batch '${batchId}' not found`,
          ErrorCode.BATCH_NOT_FOUND,
          ErrorSeverity.WARNING,
          { batchId },
        );
        getErrorHandler().handle(error);
      } catch {}
      return null;
    }

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

  getKeyframeBufferData(batchId: string): Float32Array | null {
    const keyframes = this.collector.getKeyframes(batchId);
    if (!keyframes) {
      try {
        const error = new MotionError(
          `Keyframes for batch '${batchId}' not found`,
          ErrorCode.BATCH_VALIDATION_FAILED,
          ErrorSeverity.WARNING,
          { batchId },
        );
        getErrorHandler().handle(error);
      } catch {}
      return null;
    }

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

  storeResults(batchId: string, results: BatchResult[]): boolean {
    if (!this.enableResultCaching) return false;

    this.resultCache.set(batchId, results);
    this.stats.addResultsCached(results.length);
    return true;
  }

  getResults(batchId: string): BatchResult[] | null {
    return this.resultCache.get(batchId) || null;
  }

  clearBatch(batchId: string): void {
    this.resultCache.delete(batchId);
  }

  clear(): void {
    this.resultCache.clear();
  }
}
