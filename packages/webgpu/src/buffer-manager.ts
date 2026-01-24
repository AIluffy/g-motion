import { ErrorCode, errorHandler, ErrorSeverity, MotionError } from '@g-motion/shared';
import type { BufferAllocation, ComputeMetrics } from './engine';
import {
  getPersistentGPUBufferManager,
  resetPersistentGPUBufferManager,
} from './persistent-buffer-manager';
import type { PersistentGPUBufferManager } from './persistent-buffer-manager';
import { StagingBufferPool } from './staging-pool';

export class BufferManager {
  private device: GPUDevice | null = null;
  private buffers = new Map<string, BufferAllocation>();
  private metrics: ComputeMetrics = {
    dispatchCount: 0,
    totalDispatchTime: 0,
    averageDispatchTime: 0,
    lastDispatchTime: 0,
    buffersAllocated: 0,
    totalBufferMemory: 0,
  };
  private stagingPool: StagingBufferPool | null = null;
  private persistentBufferManager: PersistentGPUBufferManager | null = null;

  async initialize(): Promise<void> {
    if (!this.device) return;
    if (!this.stagingPool) {
      this.stagingPool = new StagingBufferPool(this.device);
    }
    if (!this.persistentBufferManager) {
      getPersistentGPUBufferManager(this.device);
      this.persistentBufferManager = getPersistentGPUBufferManager();
    }
  }

  destroy(): void {
    for (const alloc of this.buffers.values()) {
      try {
        alloc.buffer.destroy();
      } catch {}
    }
    this.buffers.clear();
    this.resetMetrics();
    this.stagingPool?.clear();
    this.stagingPool = null;
    this.persistentBufferManager?.dispose();
    this.persistentBufferManager = null;
    resetPersistentGPUBufferManager();
    this.device = null;
  }

  setDevice(device: GPUDevice | null): void {
    this.device = device;
  }

  getStagingPool(): StagingBufferPool | null {
    return this.stagingPool;
  }

  setStagingPool(pool: StagingBufferPool | null): void {
    this.stagingPool = pool;
  }

  getPersistentBufferManager(): PersistentGPUBufferManager | null {
    return this.persistentBufferManager;
  }

  setPersistentBufferManager(manager: PersistentGPUBufferManager | null): void {
    this.persistentBufferManager = manager;
  }

  createBuffer(size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer | null {
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

  writeBuffer(buffer: GPUBuffer, data: Float32Array, offset = 0): boolean {
    const queue = this.device?.queue ?? null;
    if (!queue) return false;
    try {
      queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength);
      return true;
    } catch (error) {
      const motionError = new MotionError(
        'Buffer write failed',
        ErrorCode.GPU_BUFFER_WRITE_FAILED,
        ErrorSeverity.ERROR,
        {
          stage: 'writeBuffer',
          source: 'BufferManager.writeBuffer',
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
      errorHandler.handle(motionError);
      return false;
    }
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
}
