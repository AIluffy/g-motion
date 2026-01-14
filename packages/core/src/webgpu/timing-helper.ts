/**
 * WebGPU Timestamp Query Helper
 * Based on: https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html
 *
 * Provides GPU timing via timestamp queries for compute and render passes.
 * Handles feature detection, state management, and async result retrieval.
 */

// Track command buffers to prevent reading results before submission
const s_unsubmittedCommandBuffers = new Set<GPUCommandBuffer>();

// Patch GPUQueue.submit to track command buffer lifecycle
if (typeof GPUQueue !== 'undefined') {
  const originalSubmit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (commandBuffers: Iterable<GPUCommandBuffer>) {
    originalSubmit.call(this, commandBuffers);
    for (const cb of commandBuffers) {
      s_unsubmittedCommandBuffers.delete(cb);
    }
  };
}

function assert(condition: boolean, message = ''): asserts condition {
  if (!condition) {
    throw new Error(`[TimingHelper] ${message}`);
  }
}

export type TimingToken = {
  commandBuffer: GPUCommandBuffer | null;
  resultBuffer: GPUBuffer;
  queryPairIndex: number;
};

/**
 * Helper class for measuring GPU execution time via timestamp queries.
 *
 * Usage:
 * ```ts
 * const timingHelper = new TimingHelper(device);
 *
 * const encoder = device.createCommandEncoder();
 * const pass = timingHelper.beginComputePass(encoder);
 * // ... set pipeline, bind groups, dispatch ...
 * pass.end();
 * const commandBuffer = encoder.finish();
 * device.queue.submit([commandBuffer]);
 *
 * const gpuTimeNs = await timingHelper.getResult(); // Returns GPU time in nanoseconds
 * ```
 */
export class TimingHelper {
  private canTimestamp: boolean;
  private device: GPUDevice;
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private queryPairCapacity = 0;
  private frameCursor = 0;
  private freeResultBuffers: GPUBuffer[] = [];
  private legacyToken: TimingToken | null = null;

  constructor(device: GPUDevice) {
    this.device = device;
    this.canTimestamp = device.features.has('timestamp-query');

    if (this.canTimestamp) {
      this.ensureCapacity(64);
    }
  }

  /**
   * Begin a compute pass with timestamp instrumentation.
   * Returns an instrumented pass encoder that auto-resolves timing on end().
   */
  beginComputePass(
    encoder: GPUCommandEncoder,
    descriptor: GPUComputePassDescriptor = {},
  ): GPUComputePassEncoder {
    const { pass, token } = this.beginComputePassWithToken(encoder, descriptor);
    this.legacyToken = token;
    return pass;
  }

  /**
   * Begin a render pass with timestamp instrumentation.
   * Returns an instrumented pass encoder that auto-resolves timing on end().
   */
  beginRenderPass(
    encoder: GPUCommandEncoder,
    descriptor: GPURenderPassDescriptor,
  ): GPURenderPassEncoder {
    const { pass, token } = this.beginRenderPassWithToken(encoder, descriptor);
    this.legacyToken = token;
    return pass;
  }

  /**
   * Get the GPU execution time in nanoseconds.
   * Must be called after submitting the command buffer.
   *
   * @returns Promise resolving to GPU time in nanoseconds (0 if timestamps unavailable)
   */
  async getResult(): Promise<number> {
    const token = this.legacyToken;
    this.legacyToken = null;
    assert(
      !!token,
      'you must call beginComputePass/beginRenderPass and finish the encoder before getResult',
    );
    return this.getResultForToken(token);
  }

  /**
   * Check if timestamp queries are supported on this device.
   * If false, getResult() will always return 0.
   */
  hasTimestampSupport(): boolean {
    return this.canTimestamp;
  }

  beginFrame(): void {
    this.frameCursor = 0;
  }

  beginComputePassWithToken(
    encoder: GPUCommandEncoder,
    descriptor: GPUComputePassDescriptor = {},
  ): { pass: GPUComputePassEncoder; token: TimingToken | null } {
    return this.beginTimestampPassWithToken(encoder, 'beginComputePass', descriptor);
  }

  beginRenderPassWithToken(
    encoder: GPUCommandEncoder,
    descriptor: GPURenderPassDescriptor,
  ): { pass: GPURenderPassEncoder; token: TimingToken | null } {
    return this.beginTimestampPassWithToken(encoder, 'beginRenderPass', descriptor);
  }

  async getResultForToken(token: TimingToken): Promise<number> {
    if (!this.canTimestamp) {
      return 0;
    }
    assert(
      !!token.commandBuffer,
      'you must call encoder.finish and submit the command buffer before you can read the result',
    );
    assert(
      !s_unsubmittedCommandBuffers.has(token.commandBuffer),
      'you must submit the command buffer before you can read the result',
    );

    const resultBuffer = token.resultBuffer;
    await resultBuffer.mapAsync(GPUMapMode.READ);
    const times = new BigUint64Array(resultBuffer.getMappedRange());
    const duration = Number(times[1] - times[0]);
    resultBuffer.unmap();

    this.freeResultBuffers.push(resultBuffer);
    return duration;
  }

  private ensureCapacity(pairs: number): void {
    if (!this.canTimestamp) return;
    if (this.queryPairCapacity >= pairs) return;

    const nextPairs = Math.max(2, Math.pow(2, Math.ceil(Math.log2(pairs))));
    const queryCount = nextPairs * 2;
    const resolveSize = nextPairs * 16;

    try {
      (this.querySet as any)?.destroy?.();
    } catch {}
    try {
      this.resolveBuffer?.destroy();
    } catch {}

    this.querySet = this.device.createQuerySet({
      type: 'timestamp',
      count: queryCount,
    });
    this.resolveBuffer = this.device.createBuffer({
      size: resolveSize,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.queryPairCapacity = nextPairs;
  }

  private beginTimestampPassWithToken<T extends GPUComputePassEncoder | GPURenderPassEncoder>(
    encoder: GPUCommandEncoder,
    fnName: 'beginComputePass' | 'beginRenderPass',
    descriptor: any,
  ): { pass: T; token: TimingToken | null } {
    if (!this.canTimestamp) {
      return { pass: encoder[fnName](descriptor) as T, token: null };
    }

    this.ensureCapacity(this.frameCursor + 1);
    const queryPairIndex = this.frameCursor++;

    const resultBuffer =
      this.freeResultBuffers.pop() ||
      this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

    const token: TimingToken = {
      commandBuffer: null,
      resultBuffer,
      queryPairIndex,
    };

    const pass = encoder[fnName]({
      ...descriptor,
      timestampWrites: {
        querySet: this.querySet!,
        beginningOfPassWriteIndex: queryPairIndex * 2,
        endOfPassWriteIndex: queryPairIndex * 2 + 1,
      },
    }) as T;

    const originalEnd = pass.end.bind(pass);
    pass.end = () => {
      originalEnd();
      const offset = queryPairIndex * 16;
      encoder.resolveQuerySet(this.querySet!, queryPairIndex * 2, 2, this.resolveBuffer!, offset);
      encoder.copyBufferToBuffer(this.resolveBuffer!, offset, resultBuffer, 0, 16);
    };

    const originalFinish = encoder.finish.bind(encoder);
    encoder.finish = (descriptor?: GPUCommandBufferDescriptor) => {
      const cb = originalFinish(descriptor);
      token.commandBuffer = cb;
      s_unsubmittedCommandBuffers.add(cb);
      return cb;
    };

    return { pass, token };
  }
}

let sharedTimingHelper: TimingHelper | null = null;
let sharedDevice: GPUDevice | null = null;

/**
 * Singleton accessor to avoid repeated TimingHelper initialization.
 */
export function getTimingHelper(device: GPUDevice): TimingHelper {
  if (sharedTimingHelper && sharedDevice === device) {
    return sharedTimingHelper;
  }

  sharedTimingHelper = new TimingHelper(device);
  sharedDevice = device;
  return sharedTimingHelper;
}

export { NonNegativeRollingAverage } from '@g-motion/utils';
