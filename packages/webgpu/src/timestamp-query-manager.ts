import { createDebugger } from '@g-motion/shared';

const debug = createDebugger('GPUTimestampQuery');
const warn = createDebugger('GPUTimestampQuery', 'warn');

export interface GPUTimestampResult {
  durationNs: number;
  durationMs: number;
  timestamp: number;
}

/**
 * Manages WebGPU timestamp queries for precise GPU timing.
 *
 * Key features:
 * - QuerySet pooling and reuse
 * - Async readback via staging buffers
 * - Graceful fallback when feature is missing
 */
export class GPUTimestampQueryManager {
  private device: GPUDevice;
  private canTimestamp: boolean;
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private readbackBuffers: GPUBuffer[] = [];
  private queryCursor = 0;
  private readonly queryCount = 256; // Max 128 pairs per frame

  constructor(device: GPUDevice) {
    this.device = device;
    this.canTimestamp = device.features.has('timestamp-query');

    if (this.canTimestamp) {
      this.initializeResources();
    }
  }

  private initializeResources(): void {
    try {
      this.querySet = this.device.createQuerySet({
        type: 'timestamp',
        count: this.queryCount,
        label: 'GPUTimestampQueryManager-QuerySet',
      });

      this.resolveBuffer = this.device.createBuffer({
        size: this.queryCount * 8, // 8 bytes per timestamp
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        label: 'GPUTimestampQueryManager-ResolveBuffer',
      });
      debug('Timestamp resources initialized');
    } catch (err) {
      warn('Failed to initialize timestamp query resources', err);
      this.canTimestamp = false;
    }
  }

  /**
   * Check if timestamp queries are supported and enabled.
   */
  hasSupport(): boolean {
    return this.canTimestamp;
  }

  /**
   * Prepare the manager for a new frame.
   */
  beginFrame(): void {
    this.queryCursor = 0;
  }

  /**
   * Add timestamp writes to a compute pass descriptor.
   * Returns a query index if successful, null otherwise.
   */
  injectTimestampWrites(descriptor: GPUComputePassDescriptor): number | null {
    if (!this.canTimestamp || !this.querySet) return null;

    if (this.queryCursor + 2 > this.queryCount) {
      warn('Timestamp query capacity exceeded for this frame');
      return null;
    }

    const startIndex = this.queryCursor;
    this.queryCursor += 2;

    descriptor.timestampWrites = {
      querySet: this.querySet,
      beginningOfPassWriteIndex: startIndex,
      endOfPassWriteIndex: startIndex + 1,
    };

    return startIndex;
  }

  /**
   * Resolve and schedule readback for a specific query pair.
   * This should be called after the pass has ended on the same command encoder.
   */
  resolveAndReadback(
    encoder: GPUCommandEncoder,
    startIndex: number,
  ): Promise<GPUTimestampResult | null> {
    if (!this.canTimestamp || !this.querySet || !this.resolveBuffer) {
      return Promise.resolve(null);
    }

    // Reuse or create a readback buffer
    let readbackBuffer = this.readbackBuffers.pop();
    if (!readbackBuffer) {
      readbackBuffer = this.device.createBuffer({
        size: 16, // 2 timestamps * 8 bytes
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: `GPUTimestampQueryManager-Readback-${startIndex}`,
      });
    }

    const resolveOffset = startIndex * 8;
    encoder.resolveQuerySet(this.querySet, startIndex, 2, this.resolveBuffer, resolveOffset);
    encoder.copyBufferToBuffer(this.resolveBuffer, resolveOffset, readbackBuffer, 0, 16);

    const timestamp = performance.now();
    const currentBuffer = readbackBuffer;

    return currentBuffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const arrayBuffer = currentBuffer.getMappedRange();
        const timings = new BigUint64Array(arrayBuffer);
        const durationNs = Number(timings[1] - timings[0]);
        const durationMs = durationNs / 1_000_000;

        currentBuffer.unmap();
        this.readbackBuffers.push(currentBuffer);

        return {
          durationNs,
          durationMs,
          timestamp,
        };
      })
      .catch((err) => {
        warn('Failed to read timestamp query result', err);
        try {
          currentBuffer.unmap();
        } catch {}
        this.readbackBuffers.push(currentBuffer);
        return null;
      });
  }

  /**
   * Legacy wrapper to match required API if needed
   */
  beginTimestamp(_passEncoder: GPUComputePassEncoder | GPURenderPassEncoder): void {
    // This method is provided for API compatibility but the actual
    // implementation uses timestampWrites in the pass descriptor.
  }

  endTimestamp(_passEncoder: GPUComputePassEncoder | GPURenderPassEncoder): void {
    // This method is provided for API compatibility but the actual
    // implementation uses timestampWrites in the pass descriptor.
  }

  destroy(): void {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    for (const buf of this.readbackBuffers) {
      buf.destroy();
    }
    this.readbackBuffers = [];
    this.querySet = null;
    this.resolveBuffer = null;
    this.canTimestamp = false;
  }
}
