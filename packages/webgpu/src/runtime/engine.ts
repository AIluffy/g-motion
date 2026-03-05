import type { AsyncReadbackManager } from './async-readback';
import { BufferManager } from '../gpu/buffer-manager';
import type { DeviceManager } from '../gpu/device';
import { ReadbackManager } from './readback-manager';
import type { PersistentGPUBufferManager } from '../gpu/persistent-buffer-manager';
import type { StagingBufferPool } from '../gpu/staging-pool';
import type { GPUTimestampQueryManager } from '../gpu/timestamp';
import type { DeviceInitResult } from './types';
import type { PipelineManager, WorkgroupSize } from '../gpu/pipelines';
import { clearKeyframePipelineCache } from '../passes/keyframe/pipelines';
import { clearViewportCullingPipelineCache } from '../passes/viewport/culling-pipeline';
import { clearOutputFormatPipelineCache } from '../output-format/pipeline';
import { GPUDeviceLifecycle } from '../gpu/lifecycle';
import { GPUFrameCoordinator } from '../gpu/frame';
import { GPUPipelineRegistry } from '../gpu/registry';
import { GPURuntimeState } from '../gpu/state';
import type { MetricsCollector } from '../types/metrics-collector';
import { noopMetricsCollector } from '../types/metrics-collector';

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
  metricsCollector?: MetricsCollector | null;
}

export class WebGPUEngine {
  private runtimeState: GPURuntimeState;
  private pipelineRegistry: GPUPipelineRegistry;
  private frameCoordinator: GPUFrameCoordinator;
  private deviceLifecycle: GPUDeviceLifecycle;
  private readonly config: Omit<Required<WebGPUEngineConfig>, 'metricsCollector'> & {
    metricsCollector: MetricsCollector;
  };

  constructor(cfg: WebGPUEngineConfig = {}) {
    this.config = {
      powerPreference: cfg.powerPreference ?? 'high-performance',
      timestampQuery: cfg.timestampQuery ?? true,
      metricsCollector: cfg.metricsCollector ?? noopMetricsCollector,
    };
    this.runtimeState = new GPURuntimeState();
    this.pipelineRegistry = new GPUPipelineRegistry();
    this.frameCoordinator = new GPUFrameCoordinator(new BufferManager());
    this.frameCoordinator.setReadbackManager(new ReadbackManager());
    this.deviceLifecycle = new GPUDeviceLifecycle(
      this.config,
      this.runtimeState,
      this.frameCoordinator,
      this.pipelineRegistry,
      clearDeviceScopedPassCaches,
    );
  }

  async initialize(): Promise<DeviceInitResult> {
    this.config.metricsCollector.mark('webgpu-engine:initialize:start');
    const start = performance.now();
    const result = await this.deviceLifecycle.initialize();
    this.config.metricsCollector.measure(
      'webgpu-engine:initialize',
      performance.now() - start,
      { ok: result.ok },
    );
    return result;
  }
  createBuffer(size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer | null {
    return this.frameCoordinator.createBuffer(size, usage, label);
  }
  writeBuffer(buffer: GPUBuffer, data: Float32Array, offset = 0): boolean {
    return this.frameCoordinator.writeBuffer(buffer, data, offset);
  }
  getBufferStats() {
    return this.frameCoordinator.getBufferStats();
  }
  getMetrics(): ComputeMetrics {
    return this.frameCoordinator.getMetrics();
  }
  resetMetrics(): void {
    this.frameCoordinator.resetMetrics();
  }
  async initComputePipeline(cfg: {
    shaderCode: string;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];
  }): Promise<boolean> {
    return this.pipelineRegistry.initComputePipeline(cfg);
  }
  async executeCompute(
    buffers: GPUBuffer[],
    workgroupCountX: number,
    workgroupCountY = 1,
    workgroupCountZ = 1,
  ): Promise<boolean> {
    const start = performance.now();
    const executed = await this.pipelineRegistry.executeCompute(
      buffers,
      workgroupCountX,
      workgroupCountY,
      workgroupCountZ,
    );
    this.config.metricsCollector.measure('webgpu-engine:execute-compute', performance.now() - start, {
      executed,
      buffers: buffers.length,
      workgroupCountX,
      workgroupCountY,
      workgroupCountZ,
    });
    return executed;
  }
  cachePipeline(
    device: GPUDevice,
    workgroupSize: WorkgroupSize,
    pipeline: GPUComputePipeline,
    cacheId = 'default',
  ): void {
    this.pipelineRegistry.cachePipeline(device, workgroupSize, pipeline, cacheId);
  }
  async getPipelineForWorkgroup(
    device: GPUDevice,
    workgroupHint: number,
    cacheId = 'default',
  ): Promise<GPUComputePipeline | null> {
    return this.pipelineRegistry.getPipelineForWorkgroup(device, workgroupHint, cacheId);
  }
  clearPipelineCache(device?: GPUDevice): void {
    this.pipelineRegistry.clearPipelineCache(device);
  }
  selectWorkgroupSize(workgroupHint: number): WorkgroupSize {
    return this.pipelineRegistry.selectWorkgroupSize(workgroupHint);
  }
  get isInitialized() {
    return this.runtimeState.isInitialized;
  }
  get deviceAvailable() {
    return this.runtimeState.deviceAvailable;
  }
  get mockWebGPU() {
    return this.runtimeState.mockWebGPU;
  }
  get shaderVersion() {
    return this.runtimeState.shaderVersion;
  }
  get physicsPipelinesReady() {
    return this.runtimeState.physicsPipelinesReady;
  }
  get frameId() {
    return this.runtimeState.frameId;
  }
  get metricsCollector() {
    return this.config.metricsCollector;
  }
  get outputFormatStatsCounter() {
    return this.runtimeState.outputFormatStatsCounter;
  }
  get latestAsyncCullingFrameByArchetype() {
    return this.runtimeState.latestAsyncCullingFrameByArchetype;
  }
  get physicsParams() {
    return this.runtimeState.physicsParams;
  }
  setDeviceAvailable(value: boolean) {
    this.runtimeState.setDeviceAvailable(value);
  }
  setMockWebGPU(value: boolean) {
    this.runtimeState.setMockWebGPU(value);
  }
  setShaderVersion(value: number) {
    this.runtimeState.setShaderVersion(value);
  }
  setPhysicsPipelinesReady(value: boolean) {
    this.runtimeState.setPhysicsPipelinesReady(value);
  }
  incrementOutputFormatStatsCounter() {
    this.runtimeState.incrementOutputFormatStatsCounter();
  }
  setTimestampManager(manager: GPUTimestampQueryManager | null) {
    this.frameCoordinator.setTimestampManager(manager);
  }
  setTimingHelper(_helper: any) {
    // Legacy support
  }
  setBufferManager(manager: BufferManager) {
    this.frameCoordinator.setBufferManager(manager);
  }
  setStagingPool(pool: StagingBufferPool | null) {
    this.frameCoordinator.setStagingPool(pool);
  }
  setPersistentBufferManager(manager: PersistentGPUBufferManager | null) {
    this.frameCoordinator.setPersistentBufferManager(manager);
  }
  setDeviceManager(manager: DeviceManager) {
    this.deviceLifecycle.setDeviceManager(manager);
  }
  setPipelineManager(manager: PipelineManager) {
    this.pipelineRegistry.setPipelineManager(manager);
  }
  setReadbackManager(manager: AsyncReadbackManager | null) {
    this.frameCoordinator.setReadbackManager(manager);
  }
  get timestampManager() {
    return this.frameCoordinator.timestampManager;
  }
  get timingHelper() {
    return this.frameCoordinator.timestampManager;
  }
  get stagingPool() {
    return this.frameCoordinator.stagingPool;
  }
  get readbackManager() {
    return this.frameCoordinator.readbackManager;
  }
  get persistentBufferManager() {
    return this.frameCoordinator.persistentBufferManager;
  }
  get pipelineManager() {
    return this.pipelineRegistry.pipelineManagerInstance;
  }
  get bufferManagerInstance() {
    return this.frameCoordinator.bufferManagerInstance;
  }
  get deviceManagerInstance() {
    return this.deviceLifecycle.deviceManagerInstance;
  }
  beginFrame(): void {
    this.frameCoordinator.beginFrame(this.runtimeState);
  }
  endFrame(): void {
    this.frameCoordinator.endFrame();
  }
  dispose(): void {
    const device = this.deviceLifecycle.getGPUDevice();
    if (device) {
      this.pipelineRegistry.clearPipelineCache(device);
      clearDeviceScopedPassCaches(device);
    }
    this.pipelineRegistry.destroy();
    this.frameCoordinator.destroy();
    this.deviceLifecycle.destroy();
    this.runtimeState.reset();
  }
  getGPUDevice(): GPUDevice | null {
    return this.deviceLifecycle.getGPUDevice();
  }
  getGPUQueue(): GPUQueue | null {
    return this.deviceLifecycle.getGPUQueue();
  }
  getGPUAdapter(): GPUAdapter | null {
    return this.deviceLifecycle.getGPUAdapter();
  }
  ensureDevice(): GPUDevice {
    return this.deviceLifecycle.ensureDevice();
  }
  resetForTests(): void {
    this.dispose();
    this.runtimeState.reset();
    this.frameCoordinator.setTimingHelper(null);
    this.frameCoordinator.setReadbackManager(null);
    this.frameCoordinator.resetMetrics();
  }
}

function clearDeviceScopedPassCaches(device: GPUDevice): void {
  clearOutputFormatPipelineCache(device);
  clearViewportCullingPipelineCache(device);
  clearKeyframePipelineCache(device);
}

let defaultEngine: WebGPUEngine | null = null;

export function setDefaultWebGPUEngine(engine: WebGPUEngine | null): void {
  defaultEngine = engine;
}

export function getWebGPUEngine(): WebGPUEngine {
  if (!defaultEngine) {
    defaultEngine = new WebGPUEngine();
  }
  return defaultEngine;
}

export function resetWebGPUEngine(): void {
  defaultEngine?.dispose();
  defaultEngine = null;
}
