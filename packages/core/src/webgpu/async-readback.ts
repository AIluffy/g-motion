import { getErrorHandler } from '../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';

export interface PendingReadback {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  stagingBuffer: GPUBuffer;
  mapPromise: Promise<void>;
  timestamp: number;
  timeoutMs: number;
  byteSize: number;
  stride?: number;
  channels?: Array<{ index: number; property: string }>;
  leaseId?: number;
  startTime?: number;
  resolveTime?: number;
  expired?: boolean;
}

export class AsyncReadbackManager {
  private pending: PendingReadback[] = [];
  private readonly defaultTimeoutMs = 100; // 100ms default timeout

  /**
   * Queue a readback that's already mapped
   */
  enqueueMapAsync(
    archetypeId: string,
    entityIds: ArrayLike<number>,
    stagingBuffer: GPUBuffer,
    mapPromise: Promise<void>,
    byteSize: number,
    timeoutMs = this.defaultTimeoutMs,
    stride = 1,
    channels?: Array<{ index: number; property: string }>,
    leaseId?: number,
  ): void {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const entry: PendingReadback = {
      archetypeId,
      entityIds,
      stagingBuffer,
      mapPromise,
      timestamp: Date.now(),
      timeoutMs,
      byteSize,
      stride,
      channels,
      leaseId,
      startTime,
    };

    // Attach settled flag handler
    (mapPromise as any).settled = false;
    mapPromise
      .then(() => {
        (entry.mapPromise as any).settled = true;
        entry.resolveTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      })
      .catch(() => {
        // Ignore map errors here, handled in drain
        (entry.mapPromise as any).settled = true;
        entry.resolveTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      });

    this.pending.push(entry);
  }

  /**
   * Try to resolve pending readbacks; return completed ones
   * Silently discard timeouts to avoid frame drops
   *
   * @param timeBudgetMs - Max time to spend processing readbacks (default: 2ms)
   */
  async drainCompleted(timeBudgetMs = 2): Promise<
    Array<{
      archetypeId: string;
      entityIds: ArrayLike<number>;
      values?: Float32Array;
      stagingBuffer: GPUBuffer;
      byteSize: number;
      stride?: number;
      channels?: Array<{ index: number; property: string }>;
      leaseId?: number;
      syncDurationMs?: number;
      expired?: boolean;
    }>
  > {
    const results: Array<{
      archetypeId: string;
      entityIds: ArrayLike<number>;
      values?: Float32Array;
      stagingBuffer: GPUBuffer;
      byteSize: number;
      stride?: number;
      channels?: Array<{ index: number; property: string }>;
      leaseId?: number;
      syncDurationMs?: number;
      expired?: boolean;
    }> = [];
    const now = Date.now();
    const startTime = typeof performance !== 'undefined' ? performance.now() : now;

    const toRemove: number[] = [];

    for (let i = 0; i < this.pending.length; i++) {
      // Check time budget
      if (typeof performance !== 'undefined') {
        if (performance.now() - startTime > timeBudgetMs) {
          break;
        }
      }

      const p = this.pending[i];
      const elapsed = now - p.timestamp;

      // Check timeout
      if (elapsed > p.timeoutMs) {
        p.expired = true;
      }

      // Try to resolve (non-blocking check)
      try {
        const settled = (p.mapPromise as any).settled ?? false;
        if (!settled) {
          continue;
        }

        const expired = !!p.expired;
        const view = p.stagingBuffer.getMappedRange();
        const bytes = Math.max(0, Math.min(p.byteSize, view.byteLength));
        const alignedBytes = bytes - (bytes % 4);
        const values = new Float32Array(view.slice(0, alignedBytes));
        p.stagingBuffer.unmap();

        results.push({
          archetypeId: p.archetypeId,
          entityIds: p.entityIds,
          values,
          stagingBuffer: p.stagingBuffer,
          byteSize: p.byteSize,
          stride: p.stride,
          channels: p.channels,
          leaseId: p.leaseId,
          syncDurationMs: p.resolveTime && p.startTime ? p.resolveTime - p.startTime : undefined,
          expired,
        });
        toRemove.push(i);
      } catch (e) {
        try {
          const error = new MotionError(
            `[AsyncReadback] Extraction failed for '${p.archetypeId}'`,
            ErrorCode.READBACK_FAILED,
            ErrorSeverity.WARNING,
            {
              archetypeId: p.archetypeId,
              byteSize: p.byteSize,
              stride: p.stride,
              hasChannels: !!p.channels,
              entityCount: (p.entityIds as any).length,
              originalError: e instanceof Error ? e.message : String(e),
            },
          );
          getErrorHandler().handle(error);
        } catch {}

        try {
          p.stagingBuffer.unmap();
        } catch {}

        toRemove.push(i);
      }
    }

    // Remove completed in reverse order to preserve indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.pending.splice(toRemove[i], 1);
    }

    return results;
  }

  /**
   * Check pending queue length
   */
  getPendingCount(): number {
    return this.pending.length;
  }

  /**
   * Clear queue (for cleanup)
   */
  clear(): void {
    for (const p of this.pending) {
      try {
        p.stagingBuffer.unmap();
      } catch {
        // ignore
      }
    }
    this.pending = [];
  }
}
