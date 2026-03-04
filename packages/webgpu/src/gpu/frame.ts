import type { AsyncReadbackManager } from '../async-readback';
import { BufferManager } from '../buffer-manager';
import type { PersistentGPUBufferManager } from '../persistent-buffer-manager';
import { ReadbackManager } from '../readback-manager';
import type { StagingBufferPool } from '../staging-pool';
import type { GPUTimestampQueryManager } from './timestamp';
import type { GPURuntimeState } from './state';

export class GPUFrameCoordinator {
  private _bufferManager: BufferManager;
  private _readbackManager: AsyncReadbackManager | null = null;
  private _timestampManager: GPUTimestampQueryManager | null = null;

  constructor(bufferManager: BufferManager = new BufferManager()) {
    this._bufferManager = bufferManager;
    this._readbackManager = new ReadbackManager();
  }

  setDevice(device: GPUDevice | null): void {
    this._bufferManager.setDevice(device);
  }

  async initialize(): Promise<void> {
    await this._bufferManager.initialize();
    if (this._readbackManager && 'initialize' in this._readbackManager) {
      const manager = this._readbackManager as ReadbackManager;
      if (typeof manager.initialize === 'function') {
        await manager.initialize();
      }
    }
  }

  destroy(): void {
    this._bufferManager.destroy();
    if (this._readbackManager && 'destroy' in this._readbackManager) {
      const manager = this._readbackManager as ReadbackManager;
      if (typeof manager.destroy === 'function') {
        manager.destroy();
      }
    }
    this._timestampManager?.destroy();
  }

  setTimestampManager(manager: GPUTimestampQueryManager | null): void {
    this._timestampManager = manager;
  }

  get timestampManager(): GPUTimestampQueryManager | null {
    return this._timestampManager;
  }

  setTimingHelper(_helper: any): void {
    // Legacy support for TimingHelper if needed, but internally we use GPUTimestampQueryManager
  }

  get timingHelper(): any {
    return this._timestampManager;
  }

  setBufferManager(manager: BufferManager): void {
    this._bufferManager = manager;
  }

  setStagingPool(pool: StagingBufferPool | null): void {
    this._bufferManager.setStagingPool(pool);
  }

  setPersistentBufferManager(manager: PersistentGPUBufferManager | null): void {
    this._bufferManager.setPersistentBufferManager(manager);
  }

  setReadbackManager(manager: AsyncReadbackManager | null): void {
    this._readbackManager = manager;
  }

  get stagingPool(): StagingBufferPool | null {
    return this._bufferManager.getStagingPool();
  }

  get readbackManager(): AsyncReadbackManager | null {
    return this._readbackManager;
  }

  get persistentBufferManager(): PersistentGPUBufferManager | null {
    return this._bufferManager.getPersistentBufferManager();
  }

  get bufferManagerInstance(): BufferManager {
    return this._bufferManager;
  }

  createBuffer(size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer | null {
    return this._bufferManager.createBuffer(size, usage, label);
  }

  writeBuffer(buffer: GPUBuffer, data: Float32Array, offset = 0): boolean {
    return this._bufferManager.writeBuffer(buffer, data, offset);
  }

  getBufferStats() {
    return this._bufferManager.getBufferStats();
  }

  getMetrics() {
    return this._bufferManager.getMetrics();
  }

  resetMetrics(): void {
    this._bufferManager.resetMetrics();
  }

  beginFrame(runtimeState: GPURuntimeState): void {
    runtimeState.incrementFrameId();
    this._timestampManager?.beginFrame();
  }

  endFrame(): void {
    this._bufferManager.getPersistentBufferManager()?.nextFrame();
  }
}
