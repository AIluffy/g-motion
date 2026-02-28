/**
 * Unified WebGPU Engine
 *
 * Consolidates buffer management, pipeline caching, and runtime state
 * into a single unified engine with a clean API.
 */

import { panic } from '@g-motion/shared';
import type { AsyncReadbackManager } from './async-readback';
import { BufferManager } from './buffer-manager';
import { DeviceManager } from './device-manager';
import { PipelineManager } from './pipeline-manager';
import type { WorkgroupSize } from './pipeline-manager';
import { ReadbackManager } from './readback-manager';
import type { PersistentGPUBufferManager } from './persistent-buffer-manager';
import type { StagingBufferPool } from './staging-pool';
import { clearKeyframePipelineCache } from './passes/keyframe/pipelines';
import { clearViewportCullingPipelineCache } from './passes/viewport/culling-pipeline';
import { clearOutputFormatPipelineCache } from './output-format/pipeline';
import { getTimingHelper } from './timing-helper';
import type { TimingHelper } from './timing-helper';

// ============================================================================
// Types
// ============================================================================

export interface ComputeMetrics {
  dispatchCount: number;
  totalDispatchTime: number;
  averageDispatchTime: number;
  lastDispatchTime: number;
  buffersAllocated: number;
  totalBufferMemory: number;
}

export interface BufferAllocation {
  buffer: GPUBuffer;
  size: number;
  usage: GPUBufferUsageFlags;
  createdAt: number;
  label?: string;
}

export interface WebGPUEngineConfig {
  powerPreference?: GPUPowerPreference;
  timestampQuery?: boolean;
}

// ============================================================================
// WebGPU Engine
// ============================================================================

export class WebGPUEngine {
  private _deviceManager: DeviceManager;
  private _pipelineManager: PipelineManager;
  private _bufferManager: BufferManager;
  private _readbackManagerInstance: AsyncReadbackManager | null = null;
  private initPromise: Promise<boolean> | null = null;

  // Runtime state
  private _isInitialized = false;
  private _deviceAvailable = false;
  private _mockWebGPU = false;
  private _shaderVersion = -1;
  private _physicsPipelinesReady = false;
  private _frameId = 0;
  private _outputFormatStatsCounter = 0;
  private _latestAsyncCullingFrameByArchetype = new Map<string, number>();
  private _physicsParams = new Float32Array(4);

  private _timingHelper: TimingHelper | null = null;

  // Configuration
  private readonly config: Required<WebGPUEngineConfig>;

  constructor(cfg: WebGPUEngineConfig = {}) {
    this.config = {
      powerPreference: cfg.powerPreference ?? 'high-performance',
      timestampQuery: cfg.timestampQuery ?? true,
    };
    this._deviceManager = new DeviceManager(this.config);
    this._pipelineManager = new PipelineManager();
    this._bufferManager = new BufferManager();
    this._readbackManagerInstance = new ReadbackManager();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<boolean> {
    if (this._deviceManager.getDevice() && this._deviceManager.getQueue()) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initializeInternal();
    return this.initPromise;
  }

  private async _initializeInternal(): Promise<boolean> {
    await this._deviceManager.initialize();
    const device = this._deviceManager.getDevice();
    if (!device) {
      panic('requestDevice returned null; WebGPU unavailable.', {
        stage: 'device',
        source: 'WebGPUEngine.initialize',
      });
    }

    this._pipelineManager.setDevice(device);
    this._bufferManager.setDevice(device);
    await this._pipelineManager.initialize();
    await this._bufferManager.initialize();
    if (this._readbackManagerInstance && 'initialize' in this._readbackManagerInstance) {
      const manager = this._readbackManagerInstance as ReadbackManager;
      if (typeof manager.initialize === 'function') {
        await manager.initialize();
      }
    }
    void device.lost.then(() => {
      this._pipelineManager.clearPipelineCache(device);
      clearDeviceScopedPassCaches(device);
    });
    this._timingHelper = getTimingHelper(device);
    this._deviceAvailable = true;
    this._isInitialized = true;
    return true;
  }

  // ============================================================================
  // Buffer Management
  // ============================================================================

  createBuffer(size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer | null {
    return this._bufferManager.createBuffer(size, usage, label);
  }

  writeBuffer(buffer: GPUBuffer, data: Float32Array, offset = 0): boolean {
    return this._bufferManager.writeBuffer(buffer, data, offset);
  }

  getBufferStats() {
    return this._bufferManager.getBufferStats();
  }

  getMetrics(): ComputeMetrics {
    return this._bufferManager.getMetrics();
  }

  resetMetrics(): void {
    this._bufferManager.resetMetrics();
  }

  // ============================================================================
  // Compute Pipeline
  // ============================================================================

  async initComputePipeline(cfg: {
    shaderCode: string;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];
  }): Promise<boolean> {
    return this._pipelineManager.initComputePipeline(cfg);
  }

  async executeCompute(
    buffers: GPUBuffer[],
    workgroupCountX: number,
    workgroupCountY = 1,
    workgroupCountZ = 1,
  ): Promise<boolean> {
    return this._pipelineManager.executeCompute(
      buffers,
      workgroupCountX,
      workgroupCountY,
      workgroupCountZ,
    );
  }

  // ============================================================================
  // Pipeline Caching
  // ============================================================================

  cachePipeline(
    device: GPUDevice,
    workgroupSize: WorkgroupSize,
    pipeline: GPUComputePipeline,
    cacheId = 'default',
  ): void {
    this._pipelineManager.cachePipeline(device, workgroupSize, pipeline, cacheId);
  }

  async getPipelineForWorkgroup(
    device: GPUDevice,
    workgroupHint: number,
    cacheId = 'default',
  ): Promise<GPUComputePipeline | null> {
    return this._pipelineManager.getPipelineForWorkgroup(device, workgroupHint, cacheId);
  }

  clearPipelineCache(device?: GPUDevice): void {
    this._pipelineManager.clearPipelineCache(device);
  }

  selectWorkgroupSize(workgroupHint: number): WorkgroupSize {
    return this._pipelineManager.selectWorkgroupSize(workgroupHint);
  }

  // ============================================================================
  // Runtime State Accessors
  // ============================================================================

  get isInitialized() {
    return this._isInitialized;
  }
  get deviceAvailable() {
    return this._deviceAvailable;
  }
  get mockWebGPU() {
    return this._mockWebGPU;
  }
  get shaderVersion() {
    return this._shaderVersion;
  }
  get physicsPipelinesReady() {
    return this._physicsPipelinesReady;
  }
  get frameId() {
    return this._frameId;
  }
  get outputFormatStatsCounter() {
    return this._outputFormatStatsCounter;
  }
  get latestAsyncCullingFrameByArchetype() {
    return this._latestAsyncCullingFrameByArchetype;
  }
  get physicsParams() {
    return this._physicsParams;
  }

  setDeviceAvailable(value: boolean) {
    this._deviceAvailable = value;
  }
  setMockWebGPU(value: boolean) {
    this._mockWebGPU = value;
  }
  setShaderVersion(value: number) {
    this._shaderVersion = value;
  }
  setPhysicsPipelinesReady(value: boolean) {
    this._physicsPipelinesReady = value;
  }
  incrementOutputFormatStatsCounter() {
    this._outputFormatStatsCounter++;
  }

  // ============================================================================
  // Manager Injection
  // ============================================================================

  setTimingHelper(helper: TimingHelper | null) {
    this._timingHelper = helper;
  }
  setBufferManager(manager: BufferManager) {
    this._bufferManager = manager;
  }
  setStagingPool(pool: StagingBufferPool | null) {
    this._bufferManager.setStagingPool(pool);
  }
  setPersistentBufferManager(manager: PersistentGPUBufferManager | null) {
    this._bufferManager.setPersistentBufferManager(manager);
  }
  setDeviceManager(manager: DeviceManager) {
    this._deviceManager = manager;
  }
  setPipelineManager(manager: PipelineManager) {
    this._pipelineManager = manager;
  }
  setReadbackManager(manager: AsyncReadbackManager | null) {
    this._readbackManagerInstance = manager;
  }

  get timingHelper() {
    return this._timingHelper;
  }
  get stagingPool() {
    return this._bufferManager.getStagingPool();
  }
  get readbackManager() {
    return this._readbackManagerInstance;
  }
  get persistentBufferManager() {
    return this._bufferManager.getPersistentBufferManager();
  }
  get pipelineManager() {
    return this._pipelineManager;
  }
  get bufferManagerInstance() {
    return this._bufferManager;
  }
  get deviceManagerInstance() {
    return this._deviceManager;
  }

  // ============================================================================
  // Frame Lifecycle
  // ============================================================================

  beginFrame(): void {
    this._frameId++;
    this._timingHelper?.beginFrame?.();
  }

  endFrame(): void {
    this._bufferManager.getPersistentBufferManager()?.nextFrame();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  dispose(): void {
    const device = this._deviceManager.getDevice();
    if (device) {
      this._pipelineManager.clearPipelineCache(device);
      clearDeviceScopedPassCaches(device);
    }
    this._pipelineManager.destroy();
    this._bufferManager.destroy();
    if (this._readbackManagerInstance && 'destroy' in this._readbackManagerInstance) {
      const manager = this._readbackManagerInstance as ReadbackManager;
      if (typeof manager.destroy === 'function') {
        manager.destroy();
      }
    }
    this._deviceManager.destroy();
    this.initPromise = null;
    this._isInitialized = false;
    this._deviceAvailable = false;
    this._mockWebGPU = false;
    this._shaderVersion = -1;
    this._physicsPipelinesReady = false;
    this._frameId = 0;
    this._outputFormatStatsCounter = 0;
    this._latestAsyncCullingFrameByArchetype.clear();
    this._physicsParams.fill(0);
  }

  // ============================================================================
  // Device Access
  // ============================================================================

  getGPUDevice(): GPUDevice | null {
    return this._deviceManager.getDevice();
  }

  getGPUQueue(): GPUQueue | null {
    return this._deviceManager.getQueue();
  }

  ensureDevice(): GPUDevice {
    const device = this._deviceManager.getDevice();
    if (!device) {
      panic('WebGPU device not available.', {
        stage: 'device',
        source: 'WebGPUEngine.ensureDevice',
      });
    }
    return device;
  }

  // ============================================================================
  // Test Reset
  // ============================================================================

  resetForTests(): void {
    this.dispose();
    this._isInitialized = false;
    this._deviceAvailable = false;
    this._mockWebGPU = false;
    this._shaderVersion = -1;
    this._physicsPipelinesReady = false;
    this._frameId = 0;
    this._outputFormatStatsCounter = 0;
    this._latestAsyncCullingFrameByArchetype.clear();
    this._physicsParams.fill(0);
    this._timingHelper = null;
    this._readbackManagerInstance = null;
    this.resetMetrics();
  }
}

function clearDeviceScopedPassCaches(device: GPUDevice): void {
  clearOutputFormatPipelineCache(device);
  clearViewportCullingPipelineCache(device);
  clearKeyframePipelineCache(device);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let sharedEngine: WebGPUEngine | null = null;

export function getWebGPUEngine(): WebGPUEngine {
  if (!sharedEngine) {
    sharedEngine = new WebGPUEngine();
  }
  return sharedEngine;
}

export function resetWebGPUEngine(): void {
  sharedEngine?.dispose();
  sharedEngine = null;
}
