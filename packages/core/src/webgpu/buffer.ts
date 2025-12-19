// T032 & T044: Buffer Sync and Double Buffering
// Extended with compute pipeline support and resource management

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getErrorHandler } from '../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';

export interface ComputePipelineConfig {
  shaderCode: string;
  bindGroupLayoutEntries: any[];
}

/**
 * Buffer allocation and lifecycle tracking
 */
export interface BufferAllocation {
  buffer: any;
  size: number;
  usage: number;
  createdAt: number;
  label?: string;
}

/**
 * Compute execution metrics
 */
export interface ComputeMetrics {
  dispatchCount: number;
  totalDispatchTime: number;
  averageDispatchTime: number;
  lastDispatchTime: number;
  buffersAllocated: number;
  totalBufferMemory: number;
}

/**
 * WebGPU Buffer Manager with resource tracking
 * Handles buffer creation, data transfer, and compute pipeline management
 */
export class WebGPUBufferManager {
  private device: any = null;
  private queue: any = null;
  private computePipeline: any = null;
  private buffers = new Map<string, BufferAllocation>();
  private initPromise: Promise<boolean> | null = null;
  private metrics: ComputeMetrics = {
    dispatchCount: 0,
    totalDispatchTime: 0,
    averageDispatchTime: 0,
    lastDispatchTime: 0,
    buffersAllocated: 0,
    totalBufferMemory: 0,
  };

  /**
   * Initialize GPU device and queue (deduplicated, returns success flag)
   */
  async init(): Promise<boolean> {
    if (this.device && this.queue) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (typeof navigator === 'undefined' || !(navigator as any).gpu) {
        const error = new MotionError(
          'navigator.gpu not available; WebGPU disabled.',
          ErrorCode.GPU_ADAPTER_UNAVAILABLE,
          ErrorSeverity.WARNING,
        );
        getErrorHandler().handle(error);
        return false;
      }

      try {
        const gpu = (navigator as any).gpu;
        const adapter =
          (await gpu.requestAdapter({ powerPreference: 'high-performance' })) ||
          (await gpu.requestAdapter());

        if (!adapter) {
          const error = new MotionError(
            'requestAdapter returned null; WebGPU disabled.',
            ErrorCode.GPU_ADAPTER_UNAVAILABLE,
            ErrorSeverity.WARNING,
          );
          getErrorHandler().handle(error);
          return false;
        }

        const canTimestamp = adapter.features.has('timestamp-query');

        this.device = await adapter.requestDevice({
          requiredFeatures: canTimestamp ? ['timestamp-query'] : [],
        });

        if (!this.device) {
          const error = new MotionError(
            'requestDevice returned null; WebGPU disabled.',
            ErrorCode.GPU_DEVICE_UNAVAILABLE,
            ErrorSeverity.WARNING,
          );
          getErrorHandler().handle(error);
          return false;
        }

        this.queue = this.device.queue;
        return true;
      } catch (error) {
        const motionError = new MotionError(
          'Failed to initialize WebGPU device',
          ErrorCode.GPU_INIT_FAILED,
          ErrorSeverity.WARNING,
          { originalError: error instanceof Error ? error.message : String(error) },
        );
        getErrorHandler().handle(motionError);
        this.device = null;
        this.queue = null;
        return false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Create a named buffer with tracking
   */
  createBuffer(size: number, usage: any, label?: string): any {
    if (!this.device) return null;

    const buffer = this.device.createBuffer({
      size,
      usage,
      mappedAtCreation: false,
      label,
    });

    const allocationId = `${label || 'unnamed'}-${Date.now()}-${Math.random()}`;
    this.buffers.set(allocationId, {
      buffer,
      size,
      usage,
      createdAt: Date.now(),
      label,
    });

    this.metrics.buffersAllocated += 1;
    this.metrics.totalBufferMemory += size;

    return buffer;
  }

  /**
   * Write data to buffer
   */
  writeBuffer(buffer: any, data: Float32Array, offset: number = 0): boolean {
    if (!this.queue) return false;
    try {
      this.queue.writeBuffer(buffer, offset, data);
      return true;
    } catch (error) {
      const motionError = new MotionError(
        'Buffer write failed',
        ErrorCode.GPU_BUFFER_WRITE_FAILED,
        ErrorSeverity.ERROR,
        { originalError: error instanceof Error ? error.message : String(error) },
      );
      getErrorHandler().handle(motionError);
      return false;
    }
  }

  /**
   * Initialize compute pipeline for interpolation
   */
  async initComputePipeline(config: ComputePipelineConfig): Promise<boolean> {
    if (!this.device) return false;

    try {
      const shaderModule = this.device.createShaderModule({
        code: config.shaderCode,
      });

      const bindGroupLayout = this.device.createBindGroupLayout({
        entries: config.bindGroupLayoutEntries,
      });

      const pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });

      this.computePipeline = this.device.createComputePipeline({
        layout: pipelineLayout,
        compute: { module: shaderModule, entryPoint: 'main' },
      });

      return true;
    } catch (error) {
      const motionError = new MotionError(
        'Failed to initialize compute pipeline',
        ErrorCode.GPU_PIPELINE_FAILED,
        ErrorSeverity.ERROR,
        { originalError: error instanceof Error ? error.message : String(error) },
      );
      getErrorHandler().handle(motionError);
      return false;
    }
  }

  /**
   * Execute compute shader with given buffers
   * Tracks execution metrics for performance monitoring
   */
  async executeCompute(
    buffers: any[],
    workgroupCountX: number,
    workgroupCountY: number = 1,
    workgroupCountZ: number = 1,
  ): Promise<boolean> {
    if (!this.device || !this.queue || !this.computePipeline) {
      return false;
    }

    const startTime = performance.now();

    try {
      const bindGroup = this.device.createBindGroup({
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: buffers.map((buffer: any, index: number) => ({
          binding: index,
          resource: { buffer },
        })),
      });

      const commandEncoder = this.device.createCommandEncoder();
      const passEncoder = commandEncoder.beginComputePass();

      passEncoder.setPipeline(this.computePipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
      passEncoder.end();

      this.queue.submit([commandEncoder.finish()]);

      // Update metrics
      const dispatchTime = performance.now() - startTime;
      this.metrics.dispatchCount += 1;
      this.metrics.totalDispatchTime += dispatchTime;
      this.metrics.lastDispatchTime = dispatchTime;
      this.metrics.averageDispatchTime =
        this.metrics.totalDispatchTime / this.metrics.dispatchCount;

      return true;
    } catch (error) {
      const motionError = new MotionError(
        'Compute dispatch failed',
        ErrorCode.GPU_PIPELINE_FAILED,
        ErrorSeverity.ERROR,
        { originalError: error instanceof Error ? error.message : String(error) },
      );
      getErrorHandler().handle(motionError);
      return false;
    }
  }

  getDevice(): any {
    return this.device;
  }

  getQueue(): any {
    return this.queue;
  }

  getMetrics(): ComputeMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      dispatchCount: 0,
      totalDispatchTime: 0,
      averageDispatchTime: 0,
      lastDispatchTime: 0,
      buffersAllocated: 0,
      totalBufferMemory: 0,
    };
  }

  getBufferStats() {
    return {
      allocationCount: this.buffers.size,
      totalMemory: this.metrics.totalBufferMemory,
      details: Array.from(this.buffers.values()).map((alloc) => ({
        label: alloc.label,
        size: alloc.size,
        usage: alloc.usage,
        createdAt: alloc.createdAt,
      })),
    };
  }

  clear(): void {
    for (const alloc of this.buffers.values()) {
      try {
        if (alloc.buffer && typeof alloc.buffer.destroy === 'function') {
          alloc.buffer.destroy();
        }
      } catch {}
    }
    this.buffers.clear();
    this.resetMetrics();
    this.device = null;
    this.queue = null;
    this.computePipeline = null;
    this.initPromise = null;
  }
}

let sharedBufferManager: WebGPUBufferManager | null = null;

/**
 * Singleton accessor to avoid multiple WebGPU device/queue creations.
 */
export function getWebGPUBufferManager(): WebGPUBufferManager {
  if (!sharedBufferManager) {
    sharedBufferManager = new WebGPUBufferManager();
  }
  return sharedBufferManager;
}
