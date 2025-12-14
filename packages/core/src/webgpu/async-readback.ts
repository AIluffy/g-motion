/**
 * Async Readback Manager
 * Handles double/triple-buffered GPU→CPU data transfer with timeout & graceful degradation.
 */

export interface PendingReadback {
  archetypeId: string;
  entityIds: number[];
  stagingBuffer: GPUBuffer;
  mapPromise: Promise<void>;
  timestamp: number;
  timeoutMs: number;
}

export class AsyncReadbackManager {
  private pending: PendingReadback[] = [];
  private readonly defaultTimeoutMs = 100; // 100ms default timeout

  /**
   * Queue a readback that's already mapped
   */
  enqueueMapAsync(
    archetypeId: string,
    entityIds: number[],
    stagingBuffer: GPUBuffer,
    mapPromise: Promise<void>,
    timeoutMs = this.defaultTimeoutMs,
  ): void {
    this.pending.push({
      archetypeId,
      entityIds,
      stagingBuffer,
      mapPromise,
      timestamp: Date.now(),
      timeoutMs,
    });
  }

  /**
   * Try to resolve pending readbacks; return completed ones
   * Silently discard timeouts to avoid frame drops
   */
  async drainCompleted(): Promise<
    Array<{
      archetypeId: string;
      entityIds: number[];
      values: Float32Array;
      stagingBuffer: GPUBuffer;
    }>
  > {
    const results: Array<{
      archetypeId: string;
      entityIds: number[];
      values: Float32Array;
      stagingBuffer: GPUBuffer;
    }> = [];
    const now = Date.now();

    // Process in-order; stop at first pending
    const toRemove: number[] = [];

    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      const elapsed = now - p.timestamp;

      // Check timeout
      if (elapsed > p.timeoutMs) {
        console.warn(
          `[AsyncReadback] Archetype '${p.archetypeId}' readback timeout after ${elapsed}ms; discarding`,
        );
        toRemove.push(i);
        continue;
      }

      // Try to resolve (non-blocking check)
      try {
        const settled = (p.mapPromise as any).settled ?? false;
        if (!settled) {
          // Not ready yet; break (maintain order)
          break;
        }

        // Ready: extract values
        const view = p.stagingBuffer.getMappedRange();
        const values = new Float32Array(view.slice(0));
        p.stagingBuffer.unmap();

        results.push({
          archetypeId: p.archetypeId,
          entityIds: p.entityIds,
          values,
          stagingBuffer: p.stagingBuffer,
        });
        toRemove.push(i);
      } catch (e) {
        console.warn(`[AsyncReadback] Extraction failed for '${p.archetypeId}':`, e);
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
