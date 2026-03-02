import { createDebugger, panic, WebGPUConstants } from '@g-motion/shared';
import type { GPUMetricsProvider } from './metrics-provider';
import { getGPUMetricsProvider } from './metrics-provider';

const warn = createDebugger('PipelineManager', 'warn');

const WORKGROUP_SIZES = [
  WebGPUConstants.WORKGROUP.SIZE_SMALL,
  WebGPUConstants.WORKGROUP.SIZE_MEDIUM,
  WebGPUConstants.WORKGROUP.SIZE_DEFAULT,
  WebGPUConstants.WORKGROUP.SIZE_XLARGE,
] as const;

export type WorkgroupSize = (typeof WORKGROUP_SIZES)[number];

const WORKGROUP_INDEX = new Map<number, number>([
  [WebGPUConstants.WORKGROUP.SIZE_SMALL, 0],
  [WebGPUConstants.WORKGROUP.SIZE_MEDIUM, 1],
  [WebGPUConstants.WORKGROUP.SIZE_DEFAULT, 2],
  [WebGPUConstants.WORKGROUP.SIZE_XLARGE, 3],
]);

type WorkgroupHistory = {
  counts: Uint16Array;
  emaMs: Float32Array;
  lastMs: Float32Array;
  sampleCount: number;
  exploreCursor: number;
};

export class AdaptiveWorkgroupSelector {
  private histories = new Map<string, WorkgroupHistory>();
  private readonly minSamples: number;
  private readonly emaAlpha: number;
  private readonly memoryCheckInterval: number;
  private metricsProvider: GPUMetricsProvider;
  private forcedSize: WorkgroupSize | null = null;
  private memoryPenalty = 0;
  private memoryCountdown = 0;

  constructor(options?: {
    minSamples?: number;
    emaAlpha?: number;
    memoryCheckInterval?: number;
    metricsProvider?: GPUMetricsProvider;
  }) {
    this.minSamples = Math.max(1, Math.floor(options?.minSamples ?? 4));
    this.emaAlpha = Math.min(0.5, Math.max(0.05, options?.emaAlpha ?? 0.2));
    this.memoryCheckInterval = Math.max(8, Math.floor(options?.memoryCheckInterval ?? 60));
    this.metricsProvider = options?.metricsProvider ?? getGPUMetricsProvider();
  }

  setForcedWorkgroupSize(size: number | null): void {
    if (size == null) {
      this.forcedSize = null;
      return;
    }
    const index = WORKGROUP_INDEX.get(size);
    this.forcedSize = index === undefined ? null : (size as WorkgroupSize);
  }

  select(archetypeId: string, entityCount: number): WorkgroupSize {
    if (this.forcedSize) return this.forcedSize;
    const count = Number.isFinite(entityCount) ? Math.max(1, Math.floor(entityCount)) : 0;
    if (count <= 0) return this.fallbackForEntityCount(0);

    const history = this.getHistory(archetypeId);
    if (history.sampleCount === 0) {
      return this.fallbackForEntityCount(count);
    }

    if (history.sampleCount < this.minSamples * WORKGROUP_SIZES.length) {
      const total = WORKGROUP_SIZES.length;
      for (let i = 0; i < total; i++) {
        const idx = (history.exploreCursor + i) % total;
        if (history.counts[idx] < this.minSamples) {
          history.exploreCursor = (idx + 1) % total;
          return WORKGROUP_SIZES[idx];
        }
      }
    }

    const memoryPenalty = this.refreshMemoryPenalty();
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < WORKGROUP_SIZES.length; i++) {
      const size = WORKGROUP_SIZES[i];
      const ema = history.emaMs[i];
      const baseMs = ema > 0 ? ema : this.fallbackScoreBias(count, size);
      const groups = Math.ceil(count / size);
      const launched = groups * size;
      const occupancy = launched > 0 ? count / launched : 1;
      const occupancyPenalty = 1 + (1 - occupancy) * 0.25;
      const sizePenalty = memoryPenalty > 0 ? 1 + memoryPenalty * (size / WORKGROUP_SIZES[3]) : 1;
      const score = baseMs * occupancyPenalty * sizePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return WORKGROUP_SIZES[bestIndex];
  }

  recordTiming(archetypeId: string, workgroupSize: WorkgroupSize, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const index = WORKGROUP_INDEX.get(workgroupSize);
    if (index === undefined) return;
    const history = this.getHistory(archetypeId);
    const prev = history.emaMs[index];
    const next = prev === 0 ? durationMs : prev + (durationMs - prev) * this.emaAlpha;
    history.emaMs[index] = next;
    history.lastMs[index] = durationMs;
    if (history.counts[index] < 65535) {
      history.counts[index] += 1;
    }
    history.sampleCount += 1;
  }

  private getHistory(archetypeId: string): WorkgroupHistory {
    const existing = this.histories.get(archetypeId);
    if (existing) return existing;
    const history: WorkgroupHistory = {
      counts: new Uint16Array(WORKGROUP_SIZES.length),
      emaMs: new Float32Array(WORKGROUP_SIZES.length),
      lastMs: new Float32Array(WORKGROUP_SIZES.length),
      sampleCount: 0,
      exploreCursor: 0,
    };
    this.histories.set(archetypeId, history);
    return history;
  }

  private refreshMemoryPenalty(): number {
    if (this.memoryCountdown > 0) {
      this.memoryCountdown -= 1;
      return this.memoryPenalty;
    }
    this.memoryCountdown = this.memoryCheckInterval;
    const status = this.metricsProvider.getStatus();
    if (status.memoryAlertActive) {
      this.memoryPenalty = 0.25;
      return this.memoryPenalty;
    }
    const usage = status.memoryUsageBytes;
    const threshold = status.memoryUsageThresholdBytes;
    if (typeof usage === 'number' && typeof threshold === 'number' && threshold > 0) {
      const ratio = usage / threshold;
      this.memoryPenalty = ratio > 1 ? 0.2 : ratio > 0.8 ? 0.1 : 0;
      return this.memoryPenalty;
    }
    this.memoryPenalty = 0;
    return this.memoryPenalty;
  }

  private fallbackScoreBias(entityCount: number, workgroupSize: WorkgroupSize): number {
    const fallback = this.fallbackForEntityCount(entityCount);
    if (fallback === workgroupSize) return 1;
    return workgroupSize > fallback ? 1.08 : 1.04;
  }

  private fallbackForEntityCount(entityCount: number): WorkgroupSize {
    const { WORKGROUP } = WebGPUConstants;
    if (entityCount >= WORKGROUP.ENTITY_COUNT_XLARGE_THRESHOLD) return WORKGROUP.SIZE_XLARGE;
    if (entityCount <= WORKGROUP.ENTITY_COUNT_SMALL_THRESHOLD) return WORKGROUP.SIZE_SMALL;
    if (entityCount <= WORKGROUP.ENTITY_COUNT_MEDIUM_THRESHOLD) return WORKGROUP.SIZE_MEDIUM;
    return WORKGROUP.SIZE_DEFAULT;
  }
}

type PipelineBucket = {
  pipelineCache: Map<number, GPUComputePipeline>;
  pipelineCacheKey: string | null;
};

export class PipelineManager {
  private pipelineBuckets = new Map<GPUDevice, Map<string, PipelineBucket>>();
  private computePipeline: GPUComputePipeline | null = null;
  private device: GPUDevice | null = null;
  private queue: GPUQueue | null = null;
  private workgroupSelector = new AdaptiveWorkgroupSelector();

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
    archetypeId?: string,
  ): Promise<GPUComputePipeline | null> {
    const selected = this.selectWorkgroupSize(workgroupHint, archetypeId);
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

  selectWorkgroupSize(workgroupHint: number, archetypeId?: string): WorkgroupSize {
    const { WORKGROUP } = WebGPUConstants;
    if (!Number.isFinite(workgroupHint) || workgroupHint <= 0) return WORKGROUP.SIZE_DEFAULT;
    if (
      archetypeId == null &&
      (workgroupHint === WORKGROUP.SIZE_SMALL ||
        workgroupHint === WORKGROUP.SIZE_MEDIUM ||
        workgroupHint === WORKGROUP.SIZE_DEFAULT ||
        workgroupHint === WORKGROUP.SIZE_XLARGE)
    ) {
      return workgroupHint as WorkgroupSize;
    }
    const entityCount = Math.floor(workgroupHint);
    if (archetypeId) {
      return this.workgroupSelector.select(archetypeId, entityCount);
    }
    if (
      workgroupHint === WORKGROUP.SIZE_SMALL ||
      workgroupHint === WORKGROUP.SIZE_MEDIUM ||
      workgroupHint === WORKGROUP.SIZE_DEFAULT ||
      workgroupHint === WORKGROUP.SIZE_XLARGE
    ) {
      return workgroupHint as WorkgroupSize;
    }
    return this.workgroupSelector.select('default', entityCount);
  }

  setForcedWorkgroupSize(size: number | null): void {
    this.workgroupSelector.setForcedWorkgroupSize(size);
  }

  recordWorkgroupTiming(
    archetypeId: string,
    workgroupSize: WorkgroupSize,
    durationMs: number,
  ): void {
    this.workgroupSelector.recordTiming(archetypeId, workgroupSize, durationMs);
  }

  async precompileWorkgroupPipelines(
    device: GPUDevice,
    shaderCode: string,
    bindGroupLayoutEntries: GPUBindGroupLayoutEntry[],
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
