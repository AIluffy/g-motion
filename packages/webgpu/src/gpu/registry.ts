import { PipelineManager } from './pipelines';
import type { WorkgroupSize } from './pipelines';

export class GPUPipelineRegistry {
  private pipelineManager: PipelineManager;

  constructor(pipelineManager: PipelineManager = new PipelineManager()) {
    this.pipelineManager = pipelineManager;
  }

  setPipelineManager(manager: PipelineManager): void {
    this.pipelineManager = manager;
  }

  get pipelineManagerInstance(): PipelineManager {
    return this.pipelineManager;
  }

  async initialize(): Promise<void> {
    await this.pipelineManager.initialize();
  }

  destroy(): void {
    this.pipelineManager.destroy();
  }

  setDevice(device: GPUDevice | null): void {
    this.pipelineManager.setDevice(device);
  }

  cachePipeline(
    device: GPUDevice,
    workgroupSize: WorkgroupSize,
    pipeline: GPUComputePipeline,
    cacheId = 'default',
  ): void {
    this.pipelineManager.cachePipeline(device, workgroupSize, pipeline, cacheId);
  }

  async getPipelineForWorkgroup(
    device: GPUDevice,
    workgroupHint: number,
    cacheId = 'default',
    archetypeId?: string,
  ): Promise<GPUComputePipeline | null> {
    return this.pipelineManager.getPipelineForWorkgroup(
      device,
      workgroupHint,
      cacheId,
      archetypeId,
    );
  }

  clearPipelineCache(device?: GPUDevice): void {
    this.pipelineManager.clearPipelineCache(device);
  }

  selectWorkgroupSize(workgroupHint: number, archetypeId?: string): WorkgroupSize {
    return this.pipelineManager.selectWorkgroupSize(workgroupHint, archetypeId);
  }

  async precompileWorkgroupPipelines(
    device: GPUDevice,
    shaderCode: string,
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[],
    entryPoint: string = 'main',
    cacheId: string = 'default',
  ): Promise<boolean> {
    return this.pipelineManager.precompileWorkgroupPipelines(
      device,
      shaderCode,
      bindGroupLayoutEntries,
      entryPoint,
      cacheId,
    );
  }

  async initComputePipeline(cfg: {
    shaderCode: string;
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];
  }): Promise<boolean> {
    return this.pipelineManager.initComputePipeline(cfg);
  }

  async executeCompute(
    buffers: GPUBuffer[],
    workgroupCountX: number,
    workgroupCountY = 1,
    workgroupCountZ = 1,
  ): Promise<boolean> {
    return this.pipelineManager.executeCompute(
      buffers,
      workgroupCountX,
      workgroupCountY,
      workgroupCountZ,
    );
  }
}
