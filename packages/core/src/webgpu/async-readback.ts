import { getErrorHandler } from '../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';
import { WebGPUConstants } from '../constants/webgpu';
import { getNowMs } from '../utils';

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
  tag?: any;
  decode?: (
    mappedRange: ArrayBuffer,
    entry: PendingReadback,
  ) => {
    archetypeId?: string;
    entityIds?: ArrayLike<number>;
    values?: Float32Array;
    byteSize?: number;
    stride?: number;
    channels?: Array<{ index: number; property: string }>;
    leaseId?: number;
    tag?: any;
  } | null;
  startTime?: number;
  resolveTime?: number;
  expired?: boolean;
}

export class AsyncReadbackManager {
  private pending: PendingReadback[] = [];
  private readonly defaultTimeoutMs: number = WebGPUConstants.GPU.DEFAULT_READBACK_TIMEOUT_MS;
  private completedCount = 0;
  private expiredCount = 0;

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
    tag?: any,
  ): void {
    const startTime = getNowMs();
    const entry: PendingReadback = {
      archetypeId,
      entityIds,
      stagingBuffer,
      mapPromise,
      timestamp: getNowMs(),
      timeoutMs,
      byteSize,
      stride,
      channels,
      leaseId,
      tag,
      startTime,
    };

    // Attach settled flag handler
    (mapPromise as any).settled = false;
    mapPromise
      .then(() => {
        (entry.mapPromise as any).settled = true;
        entry.resolveTime = getNowMs();
      })
      .catch(() => {
        // Ignore map errors here, handled in drain
        (entry.mapPromise as any).settled = true;
        entry.resolveTime = getNowMs();
      });

    this.pending.push(entry);
  }

  enqueueMapAsyncDecoded(
    archetypeId: string,
    stagingBuffer: GPUBuffer,
    mapPromise: Promise<void>,
    byteSize: number,
    decode: PendingReadback['decode'],
    timeoutMs = this.defaultTimeoutMs,
    tag?: any,
  ): void {
    const startTime = getNowMs();
    const entry: PendingReadback = {
      archetypeId,
      entityIds: [],
      stagingBuffer,
      mapPromise,
      timestamp: getNowMs(),
      timeoutMs,
      byteSize,
      decode,
      tag,
      startTime,
    };

    (mapPromise as any).settled = false;
    mapPromise
      .then(() => {
        (entry.mapPromise as any).settled = true;
        entry.resolveTime = getNowMs();
      })
      .catch(() => {
        (entry.mapPromise as any).settled = true;
        entry.resolveTime = getNowMs();
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
      tag?: any;
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
      tag?: any;
      syncDurationMs?: number;
      expired?: boolean;
    }> = [];
    const now = getNowMs();
    const startTime = getNowMs();

    const toRemove: number[] = [];

    for (let i = 0; i < this.pending.length; i++) {
      // Check time budget
      if (getNowMs() - startTime > timeBudgetMs) {
        break;
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
        const decoded = p.decode ? p.decode(view, p) : undefined;
        if (p.decode && decoded === null) {
          try {
            p.stagingBuffer.unmap();
          } catch {}
          toRemove.push(i);
          continue;
        }

        const finalArchetypeId = decoded?.archetypeId ?? p.archetypeId;
        const finalEntityIds = decoded?.entityIds ?? p.entityIds;
        const finalStride = decoded?.stride ?? p.stride;
        const finalChannels = decoded?.channels ?? p.channels;
        const finalLeaseId = decoded?.leaseId ?? p.leaseId;
        const finalTag = decoded?.tag ?? p.tag;
        const finalByteSize = decoded?.byteSize ?? (p.decode ? 0 : p.byteSize);

        let values: Float32Array | undefined;
        if (p.decode) {
          values = decoded?.values;
        } else {
          const bytes = Math.max(0, Math.min(p.byteSize, view.byteLength));
          const alignedBytes = bytes - (bytes % 4);
          values = new Float32Array(view.slice(0, alignedBytes));
        }
        p.stagingBuffer.unmap();

        results.push({
          archetypeId: finalArchetypeId,
          entityIds: finalEntityIds,
          values,
          stagingBuffer: p.stagingBuffer,
          byteSize: finalByteSize,
          stride: finalStride,
          channels: finalChannels,
          leaseId: finalLeaseId,
          tag: finalTag,
          syncDurationMs: p.resolveTime && p.startTime ? p.resolveTime - p.startTime : undefined,
          expired,
        });
        this.completedCount += 1;
        if (expired) this.expiredCount += 1;
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

  getQueueDepth(): number {
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
    this.completedCount = 0;
    this.expiredCount = 0;
  }

  getTimeoutRate(): number {
    if (this.completedCount <= 0) return 0;
    return this.expiredCount / this.completedCount;
  }
}
