/**
 * Unified WebGPU Engine
 *
 * Consolidates buffer management, pipeline caching, and runtime state
 * into a single unified engine with a clean API.
 */

import { getErrorHandler } from '../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';
import { WebGPUConstants } from '../constants/webgpu';
import type { AsyncReadbackManager } from './async-readback';
import type { TimingHelper } from './timing-helper';
import type { StagingBufferPool } from './staging-pool';
import type { PersistentGPUBufferManager } from './persistent-buffer-manager';

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

export type WorkgroupSize = 16 | 32 | 64 | 128;

interface PipelineBucket {
  pipelineCache: Map<WorkgroupSize, GPUComputePipeline>;
  cacheKey: string | null;
  device: GPUDevice | null;
}

export interface WebGPUEngineConfig {
  powerPreference?: GPUPowerPreference;
  timestampQuery?: boolean;
}

// ============================================================================
// WebGPU Engine
// ============================================================================

export class WebGPUEngine {
  // Device and queue
  private device: GPUDevice | null = null;
  private queue: GPUQueue | null = null;
  private adapter: GPUAdapter | null = null;

  // Buffer management
  private buffers = new Map<string, BufferAllocation>();
  private metrics: ComputeMetrics = {
    dispatchCount: 0,
    totalDispatchTime: 0,
    averageDispatchTime: 0,
    lastDispatchTime: 0,
    buffersAllocated: 0,
    totalBufferMemory: 0,
  };
  private initPromise: Promise<boolean> | null = null;

  // Compute pipeline
  private computePipeline: GPUComputePipeline | null = null;

  // Pipeline caching
  private pipelineBuckets = new Map<string, PipelineBucket>();

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

  // Managers (injected or lazy-initialized)
  private _timingHelper: TimingHelper | null = null;
  private _stagingPool: StagingBufferPool | null = null;
  private _readbackManager: AsyncReadbackManager | null = null;
  private _persistentBufferManager: PersistentGPUBufferManager | null = null;

  // Configuration
  private readonly config: Required<WebGPUEngineConfig>;

  constructor(cfg: WebGPUEngineConfig = {}) {
    this.config = {
      powerPreference: cfg.powerPreference ?? 'high-performance',
      timestampQuery: cfg.timestampQuery ?? true,
    };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<boolean> {
    if (this.device && this.queue) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initializeInternal();
    return this.initPromise;
  }

  private async _initializeInternal(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as unknown as { gpu?: unknown }).gpu) {
      const error = new MotionError(
        'navigator.gpu not available; WebGPU disabled.',
        ErrorCode.GPU_ADAPTER_UNAVAILABLE,
        ErrorSeverity.FATAL,
        {
          env: typeof navigator === 'undefined' ? 'no-navigator' : 'navigator-no-gpu',
          source: 'WebGPUEngine.initialize',
        },
      );
      getErrorHandler().handle(error);
      throw error;
    }

    try {
      const gpu = (
        navigator as unknown as {
          gpu: {
            requestAdapter: (options?: {
              powerPreference?: GPUPowerPreference;
            }) => Promise<GPUAdapter | null>;
          };
        }
      ).gpu;
      this.adapter = await gpu.requestAdapter({ powerPreference: this.config.powerPreference });

      if (!this.adapter) {
        const error = new MotionError(
          'requestAdapter returned null; WebGPU disabled.',
          ErrorCode.GPU_ADAPTER_UNAVAILABLE,
          ErrorSeverity.FATAL,
          { stage: 'adapter', source: 'WebGPUEngine.initialize' },
        );
        getErrorHandler().handle(error);
        throw error;
      }

      const canTimestamp =
        this.config.timestampQuery && this.adapter.features.has('timestamp-query');

      this.device = await this.adapter.requestDevice({
        requiredFeatures: canTimestamp ? ['timestamp-query'] : [],
      });

      if (!this.device) {
        const error = new MotionError(
          'requestDevice returned null; WebGPU disabled.',
          ErrorCode.GPU_DEVICE_UNAVAILABLE,
          ErrorSeverity.FATAL,
          { stage: 'device', source: 'WebGPUEngine.initialize' },
        );
        getErrorHandler().handle(error);
        throw error;
      }

      this.queue = this.device.queue;
      this._deviceAvailable = true;
      this._isInitialized = true;

      return true;
    } catch (error) {
      const motionError = new MotionError(
        'Failed to initialize WebGPU device',
        ErrorCode.GPU_INIT_FAILED,
        ErrorSeverity.FATAL,
        {
          stage: 'device',
          source: 'WebGPUEngine.initialize',
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
      getErrorHandler().handle(motionError);
      this.device = null;
      this.queue = null;
      throw motionError;
    }
  }

  // ============================================================================
  // Buffer Management
  // ============================================================================

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
    if (!this.queue) return false;
    try {
      this.queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength);
      return true;
    } catch (error) {
      const motionError = new MotionError(
        'Buffer write failed',
        ErrorCode.GPU_BUFFER_WRITE_FAILED,
        ErrorSeverity.ERROR,
        {
          stage: 'writeBuffer',
          source: 'WebGPUEngine.writeBuffer',
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
      getErrorHandler().handle(motionError);
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

  // ============================================================================
  // Compute Pipeline
  // ============================================================================

  async initComputePipeline(cfg: {
    shaderCode: string;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];
  }): Promise<boolean> {
    if (!this.device) return false;

    try {
      const shaderModule = this.device.createShaderModule({
        code: cfg.shaderCode,
      });

      const bindGroupLayout = this.device.createBindGroupLayout({
        entries: cfg.bindGroupLayoutEntries,
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
        ErrorSeverity.FATAL,
        {
          stage: 'pipeline',
          source: 'WebGPUEngine.initComputePipeline',
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
      getErrorHandler().handle(motionError);
      throw motionError;
    }
  }

  async executeCompute(
    buffers: GPUBuffer[],
    workgroupCountX: number,
    workgroupCountY = 1,
    workgroupCountZ = 1,
  ): Promise<boolean> {
    if (!this.device || !this.queue || !this.computePipeline) {
      return false;
    }

    const startTime = performance.now();

    try {
      const bindGroup = this.device.createBindGroup({
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: buffers.map((buffer, index) => ({
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
        {
          stage: 'dispatch',
          source: 'WebGPUEngine.executeCompute',
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
      getErrorHandler().handle(motionError);
      return false;
    }
  }

  // ============================================================================
  // Pipeline Caching
  // ============================================================================

  private _getBucket(cacheId: string): PipelineBucket {
    const id = cacheId || 'default';
    let b = this.pipelineBuckets.get(id);
    if (!b) {
      b = {
        pipelineCache: new Map(),
        cacheKey: null,
        device: null,
      };
      this.pipelineBuckets.set(id, b);
    }
    return b;
  }

  cachePipeline(
    workgroupSize: WorkgroupSize,
    pipeline: GPUComputePipeline,
    cacheId = 'default',
  ): void {
    this._getBucket(cacheId).pipelineCache.set(workgroupSize, pipeline);
  }

  async getPipelineForWorkgroup(
    workgroupHint: number,
    cacheId = 'default',
  ): Promise<GPUComputePipeline | null> {
    const selected = this._selectWorkgroupSize(workgroupHint);
    const bucket = this._getBucket(cacheId);
    const pipelineCache = bucket.pipelineCache;
    const { WORKGROUP } = WebGPUConstants;

    return (
      pipelineCache.get(selected) ??
      pipelineCache.get(WORKGROUP.SIZE_DEFAULT) ??
      pipelineCache.get(WORKGROUP.SIZE_MEDIUM) ??
      pipelineCache.get(WORKGROUP.SIZE_SMALL) ??
      pipelineCache.get(WORKGROUP.SIZE_XLARGE) ??
      null
    );
  }

  clearPipelineCache(): void {
    for (const b of this.pipelineBuckets.values()) {
      b.pipelineCache.clear();
      b.cacheKey = null;
      b.device = null;
    }
  }

  private _selectWorkgroupSize(workgroupHint: number): WorkgroupSize {
    const { WORKGROUP } = WebGPUConstants;

    if (!Number.isFinite(workgroupHint) || workgroupHint <= 0)
      return WORKGROUP.SIZE_DEFAULT as WorkgroupSize;
    if (
      workgroupHint === WORKGROUP.SIZE_SMALL ||
      workgroupHint === WORKGROUP.SIZE_MEDIUM ||
      workgroupHint === WORKGROUP.SIZE_DEFAULT ||
      workgroupHint === WORKGROUP.SIZE_XLARGE
    ) {
      return workgroupHint as WorkgroupSize;
    }

    const entityCount = Math.floor(workgroupHint);
    if (entityCount >= WORKGROUP.ENTITY_COUNT_XLARGE_THRESHOLD)
      return WORKGROUP.SIZE_XLARGE as WorkgroupSize;
    if (entityCount < WORKGROUP.ENTITY_COUNT_SMALL_THRESHOLD)
      return WORKGROUP.SIZE_SMALL as WorkgroupSize;
    if (entityCount < WORKGROUP.ENTITY_COUNT_MEDIUM_THRESHOLD)
      return WORKGROUP.SIZE_MEDIUM as WorkgroupSize;
    return WORKGROUP.SIZE_DEFAULT as WorkgroupSize;
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
  setStagingPool(pool: StagingBufferPool | null) {
    this._stagingPool = pool;
  }
  setReadbackManager(manager: AsyncReadbackManager | null) {
    this._readbackManager = manager;
  }
  setPersistentBufferManager(manager: PersistentGPUBufferManager | null) {
    this._persistentBufferManager = manager;
  }

  get timingHelper() {
    return this._timingHelper;
  }
  get stagingPool() {
    return this._stagingPool;
  }
  get readbackManager() {
    return this._readbackManager;
  }
  get persistentBufferManager() {
    return this._persistentBufferManager;
  }

  // ============================================================================
  // Frame Lifecycle
  // ============================================================================

  beginFrame(): void {
    this._frameId++;
    this._timingHelper?.beginFrame?.();
  }

  endFrame(): void {
    this._persistentBufferManager?.nextFrame();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  dispose(): void {
    for (const alloc of this.buffers.values()) {
      try {
        alloc.buffer.destroy();
      } catch {}
    }
    this.buffers.clear();

    this.clearPipelineCache();

    this._persistentBufferManager?.dispose();

    this.device = null;
    this.queue = null;
    this.adapter = null;
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
    this.computePipeline = null;
  }

  // ============================================================================
  // Device Access
  // ============================================================================

  getGPUDevice(): GPUDevice | null {
    return this.device;
  }

  getGPUQueue(): GPUQueue | null {
    return this.queue;
  }

  ensureDevice(): GPUDevice {
    if (!this.device) {
      throw new MotionError(
        'WebGPU device not available.',
        ErrorCode.GPU_DEVICE_UNAVAILABLE,
        ErrorSeverity.FATAL,
        { stage: 'device', source: 'WebGPUEngine.ensureDevice' },
      );
    }
    return this.device;
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
    this._stagingPool = null;
    this._readbackManager = null;
    this._persistentBufferManager = null;
    this.resetMetrics();
  }
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
