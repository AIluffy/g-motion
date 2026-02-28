import { createWarn, panic, WebGPUConstants } from '@g-motion/shared';

const warn = createWarn('PipelineManager');

const WORKGROUP_SIZES = [
  WebGPUConstants.WORKGROUP.SIZE_SMALL,
  WebGPUConstants.WORKGROUP.SIZE_MEDIUM,
  WebGPUConstants.WORKGROUP.SIZE_DEFAULT,
  WebGPUConstants.WORKGROUP.SIZE_XLARGE,
] as const;

export type WorkgroupSize = (typeof WORKGROUP_SIZES)[number];

type PipelineBucket = {
  pipelineCache: Map<number, GPUComputePipeline>;
  pipelineCacheKey: string | null;
};

export class PipelineManager {
  private pipelineBuckets = new Map<GPUDevice, Map<string, PipelineBucket>>();
  private computePipeline: GPUComputePipeline | null = null;
  private device: GPUDevice | null = null;
  private queue: GPUQueue | null = null;

  async initialize(): Promise<void> {}

  destroy(): void {
    this.clearPipelineCache();
    this.computePipeline = null;
    this.device = null;
    this.queue = null;
  }

  setDevice(device: GPUDevice | null): void {
    this.device = device;
    this.queue = device?.queue ?? null;
    if (!device) {
      this.computePipeline = null;
    }
  }

  cachePipeline(
    device: GPUDevice,
    workgroupSize: WorkgroupSize,
    pipeline: GPUComputePipeline,
    cacheId = 'default',
  ): void {
    this.getBucket(device, cacheId).pipelineCache.set(workgroupSize, pipeline);
  }

  async getPipelineForWorkgroup(
    device: GPUDevice,
    workgroupHint: number,
    cacheId = 'default',
  ): Promise<GPUComputePipeline | null> {
    const selected = this.selectWorkgroupSize(workgroupHint);
    const pipelineCache = this.getBucket(device, cacheId).pipelineCache;
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

  clearPipelineCache(device?: GPUDevice): void {
    if (device) {
      const buckets = this.pipelineBuckets.get(device);
      if (!buckets) return;
      for (const b of buckets.values()) {
        b.pipelineCache.clear();
        b.pipelineCacheKey = null;
      }
      this.pipelineBuckets.delete(device);
      return;
    }
    for (const buckets of this.pipelineBuckets.values()) {
      for (const b of buckets.values()) {
        b.pipelineCache.clear();
        b.pipelineCacheKey = null;
      }
    }
    this.pipelineBuckets.clear();
  }

  selectWorkgroupSize(workgroupHint: number): WorkgroupSize {
    const { WORKGROUP } = WebGPUConstants;
    if (!Number.isFinite(workgroupHint) || workgroupHint <= 0) return WORKGROUP.SIZE_DEFAULT;
    if (
      workgroupHint === WORKGROUP.SIZE_SMALL ||
      workgroupHint === WORKGROUP.SIZE_MEDIUM ||
      workgroupHint === WORKGROUP.SIZE_DEFAULT ||
      workgroupHint === WORKGROUP.SIZE_XLARGE
    ) {
      return workgroupHint as WorkgroupSize;
    }
    const entityCount = Math.floor(workgroupHint);
    if (entityCount >= WORKGROUP.ENTITY_COUNT_XLARGE_THRESHOLD) return WORKGROUP.SIZE_XLARGE;
    if (entityCount < WORKGROUP.ENTITY_COUNT_SMALL_THRESHOLD) return WORKGROUP.SIZE_SMALL;
    if (entityCount < WORKGROUP.ENTITY_COUNT_MEDIUM_THRESHOLD) return WORKGROUP.SIZE_MEDIUM;
    return WORKGROUP.SIZE_DEFAULT;
  }

  async precompileWorkgroupPipelines(
    device: GPUDevice,
    shaderCode: string,
    bindGroupLayoutEntries: any[],
    entryPoint: string = 'main',
    cacheId: string = 'default',
  ): Promise<boolean> {
    const bucket = this.getBucket(device, cacheId);
    const key = buildCacheKey(shaderCode, bindGroupLayoutEntries, entryPoint);
    const { WORKGROUP } = WebGPUConstants;
    const hasAll =
      bucket.pipelineCache.has(WORKGROUP.SIZE_SMALL) &&
      bucket.pipelineCache.has(WORKGROUP.SIZE_MEDIUM) &&
      bucket.pipelineCache.has(WORKGROUP.SIZE_DEFAULT) &&
      bucket.pipelineCache.has(WORKGROUP.SIZE_XLARGE);
    if (bucket.pipelineCacheKey === key && hasAll) {
      return true;
    }

    bucket.pipelineCache.clear();
    bucket.pipelineCacheKey = key;

    try {
      const bindGroupLayout = device.createBindGroupLayout({
        label: 'motion-workgroup-variant-bgl',
        entries: bindGroupLayoutEntries,
      });

      const pipelineLayout = device.createPipelineLayout({
        label: 'motion-workgroup-variant-pl',
        bindGroupLayouts: [bindGroupLayout],
      });

      for (const wg of WORKGROUP_SIZES) {
        const variantCode = makeWorkgroupVariant(shaderCode, wg);
        const shaderModule = device.createShaderModule({
          code: variantCode,
          label: `motion-interp-wgsl-wg${wg}`,
        });

        const pipeline = device.createComputePipeline({
          label: `motion-interp-pipeline-wg${wg}`,
          layout: pipelineLayout,
          compute: { module: shaderModule, entryPoint },
        });

        bucket.pipelineCache.set(wg, pipeline);
      }

      return true;
    } catch {
      bucket.pipelineCache.clear();
      bucket.pipelineCacheKey = null;
      return false;
    }
  }

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
      panic('Failed to initialize compute pipeline', {
        stage: 'pipeline',
        source: 'PipelineManager.initComputePipeline',
        originalError: error instanceof Error ? error.message : String(error),
      });
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
      if (Number.isFinite(dispatchTime)) {
        void dispatchTime;
      }

      return true;
    } catch (error) {
      warn('Compute dispatch failed', {
        stage: 'dispatch',
        source: 'PipelineManager.executeCompute',
        originalError: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private getBucket(device: GPUDevice, cacheId: string): PipelineBucket {
    const id = cacheId || 'default';
    let deviceBuckets = this.pipelineBuckets.get(device);
    if (!deviceBuckets) {
      deviceBuckets = new Map();
      this.pipelineBuckets.set(device, deviceBuckets);
    }
    let b = deviceBuckets.get(id);
    if (!b) {
      b = {
        pipelineCache: new Map(),
        pipelineCacheKey: null,
      };
      deviceBuckets.set(id, b);
    }
    return b;
  }
}

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function buildCacheKey(
  shaderCode: string,
  bindGroupLayoutEntries: any[],
  entryPoint: string,
): string {
  const bindingsSig = Array.isArray(bindGroupLayoutEntries)
    ? bindGroupLayoutEntries
        .map((e: any) => {
          const t = e?.buffer?.type ? String(e.buffer.type) : '';
          return `${e?.binding ?? ''}:${e?.visibility ?? ''}:${t}`;
        })
        .join('|')
    : '';
  return `${entryPoint}|${hashString(shaderCode)}|${hashString(bindingsSig)}`;
}

function makeWorkgroupVariant(shaderCode: string, workgroupSize: WorkgroupSize): string {
  return shaderCode.replace(/@workgroup_size\(\s*\d+\s*\)/g, `@workgroup_size(${workgroupSize})`);
}
