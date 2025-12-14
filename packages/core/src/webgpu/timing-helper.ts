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

type State = 'free' | 'need resolve' | 'need finish' | 'wait for result';

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
  private resultBuffer: GPUBuffer | null = null;
  private commandBuffer: GPUCommandBuffer | null = null;
  private resultBuffers: GPUBuffer[] = [];
  private state: State = 'free';

  constructor(device: GPUDevice) {
    this.device = device;
    this.canTimestamp = device.features.has('timestamp-query');

    if (this.canTimestamp) {
      this.querySet = device.createQuerySet({
        type: 'timestamp',
        count: 2,
      });
      this.resolveBuffer = device.createBuffer({
        size: this.querySet.count * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
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
    return this.#beginTimestampPass(encoder, 'beginComputePass', descriptor);
  }

  /**
   * Begin a render pass with timestamp instrumentation.
   * Returns an instrumented pass encoder that auto-resolves timing on end().
   */
  beginRenderPass(
    encoder: GPUCommandEncoder,
    descriptor: GPURenderPassDescriptor,
  ): GPURenderPassEncoder {
    return this.#beginTimestampPass(encoder, 'beginRenderPass', descriptor);
  }

  /**
   * Get the GPU execution time in nanoseconds.
   * Must be called after submitting the command buffer.
   *
   * @returns Promise resolving to GPU time in nanoseconds (0 if timestamps unavailable)
   */
  async getResult(): Promise<number> {
    if (!this.canTimestamp) {
      return 0;
    }

    assert(
      this.state === 'wait for result',
      'you must call encoder.finish and submit the command buffer before you can read the result',
    );
    assert(!!this.commandBuffer, 'internal error: no command buffer tracked');
    assert(
      !s_unsubmittedCommandBuffers.has(this.commandBuffer),
      'you must submit the command buffer before you can read the result',
    );

    this.commandBuffer = null;
    this.state = 'free';

    const resultBuffer = this.resultBuffer!;
    await resultBuffer.mapAsync(GPUMapMode.READ);
    const times = new BigUint64Array(resultBuffer.getMappedRange());
    const duration = Number(times[1] - times[0]);
    resultBuffer.unmap();

    // Recycle result buffer for next use
    this.resultBuffers.push(resultBuffer);

    return duration;
  }

  /**
   * Check if timestamp queries are supported on this device.
   * If false, getResult() will always return 0.
   */
  hasTimestampSupport(): boolean {
    return this.canTimestamp;
  }

  /**
   * Internal method to wrap pass creation with timestamp writes.
   */
  private beginTimestampPass<T extends GPUComputePassEncoder | GPURenderPassEncoder>(
    encoder: GPUCommandEncoder,
    fnName: 'beginComputePass' | 'beginRenderPass',
    descriptor: any,
  ): T {
    if (!this.canTimestamp) {
      return encoder[fnName](descriptor) as T;
    }

    assert(this.state === 'free', `state not free (current: ${this.state})`);
    this.state = 'need resolve';

    const pass = encoder[fnName]({
      ...descriptor,
      timestampWrites: {
        querySet: this.querySet!,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    }) as T;

    // Wrap pass.end() to trigger resolve
    const originalEnd = pass.end.bind(pass);
    pass.end = () => {
      originalEnd();
      this.#resolveTiming(encoder);
    };

    // Wrap encoder.finish() to track command buffer
    const originalFinish = encoder.finish.bind(encoder);
    encoder.finish = (descriptor?: GPUCommandBufferDescriptor) => {
      const cb = originalFinish(descriptor);
      this.#trackCommandBuffer(cb);
      return cb;
    };

    return pass;
  }

  /**
   * Resolve timestamp queries into a result buffer.
   */
  private resolveTiming(encoder: GPUCommandEncoder): void {
    if (!this.canTimestamp) {
      return;
    }

    assert(
      this.state === 'need resolve',
      'you must use timingHelper.beginComputePass or timingHelper.beginRenderPass',
    );
    this.state = 'need finish';

    // Reuse or create result buffer
    this.resultBuffer =
      this.resultBuffers.pop() ||
      this.device.createBuffer({
        size: this.resolveBuffer!.size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

    encoder.resolveQuerySet(this.querySet!, 0, 2, this.resolveBuffer!, 0);
    encoder.copyBufferToBuffer(
      this.resolveBuffer!,
      0,
      this.resultBuffer,
      0,
      this.resultBuffer.size,
    );
  }

  // Use # prefix for private method (already declared with 'private')
  #resolveTiming = this.resolveTiming;

  /**
   * Track command buffer to prevent premature result reads.
   */
  private trackCommandBuffer(cb: GPUCommandBuffer): void {
    if (!this.canTimestamp) {
      return;
    }

    assert(this.state === 'need finish', 'you must call encoder.finish');
    this.commandBuffer = cb;
    s_unsubmittedCommandBuffers.add(cb);
    this.state = 'wait for result';
  }

  #trackCommandBuffer = this.trackCommandBuffer;

  #beginTimestampPass = this.beginTimestampPass;
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

/**
 * Rolling average calculator for GPU timing samples.
 * Filters out NaN, Infinity, and negative values (GPU timestamp edge cases).
 *
 * Usage:
 * ```ts
 * const gpuAverage = new NonNegativeRollingAverage(30); // 30 samples
 *
 * timingHelper.getResult().then(gpuTimeNs => {
 *   gpuAverage.addSample(gpuTimeNs / 1_000_000); // Convert ns to ms
 *   console.log(`Avg GPU time: ${gpuAverage.get().toFixed(2)}ms`);
 * });
 * ```
 */
export class NonNegativeRollingAverage {
  private total = 0;
  private samples: number[] = [];
  private cursor = 0;
  private numSamples: number;

  constructor(numSamples = 30) {
    this.numSamples = numSamples;
  }

  /**
   * Add a new sample to the rolling average.
   * Ignores NaN, Infinity, and negative values.
   */
  addSample(value: number): void {
    if (!Number.isNaN(value) && Number.isFinite(value) && value >= 0) {
      this.total += value - (this.samples[this.cursor] || 0);
      this.samples[this.cursor] = value;
      this.cursor = (this.cursor + 1) % this.numSamples;
    }
  }

  /**
   * Get the current rolling average.
   * Returns 0 if no valid samples have been added.
   */
  get(): number {
    return this.samples.length > 0 ? this.total / this.samples.length : 0;
  }

  /**
   * Reset the rolling average to initial state.
   */
  reset(): void {
    this.total = 0;
    this.samples = [];
    this.cursor = 0;
  }
}
