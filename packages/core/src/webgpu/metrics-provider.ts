import { isDev } from '@g-motion/utils';

export interface GPUBatchStatus {
  enabled: boolean;
  activeEntityCount: number;
  threshold: number;
  webgpuAvailable: boolean;
  gpuInitialized: boolean;
  frameTimeMs?: number;
  queueDepth?: number;
  cpuFallbackActive?: boolean;
}

export interface GPUBatchMetric {
  batchId: string;
  entityCount: number;
  timestamp: number;
  gpu: boolean;
  // GPU→DOM Sync tracking
  syncPerformed?: boolean;
  syncDurationMs?: number;
  syncDataSize?: number;
  // GPU Compute timing (via timestamp queries)
  gpuComputeTimeMs?: number;
  gpuComputeTimeNs?: number;
  workgroupsDispatched?: number;
}

export interface GPUArchetypeTiming {
  avgComputeMs: number;
  minComputeMs: number;
  maxComputeMs: number;
  dispatchCount: number;
  entityCount: number;
}

export interface GPUMetricsProvider {
  getStatus(): GPUBatchStatus;
  updateStatus(update: Partial<GPUBatchStatus>): GPUBatchStatus;
  recordMetric(metric: GPUBatchMetric): void;
  getMetrics(): GPUBatchMetric[];
  clear(): void;
  seedFromLegacy(input: {
    status?: any;
    metrics?: GPUBatchMetric[];
    gpuInitialized?: boolean;
    webgpuAvailable?: boolean;
  }): void;
  getArchetypeTimings(): Map<string, GPUArchetypeTiming>;
  calculateDynamicThreshold(baseThreshold?: number, targetFrameTime?: number): number;
}

const DEFAULT_STATUS: GPUBatchStatus = {
  enabled: false,
  activeEntityCount: 0,
  threshold: 1000,
  webgpuAvailable: false,
  gpuInitialized: false,
};

class InMemoryGPUMetricsProvider implements GPUMetricsProvider {
  private status: GPUBatchStatus = { ...DEFAULT_STATUS };
  private metrics: GPUBatchMetric[] = [];
  private archetypeTimings = new Map<string, GPUArchetypeTiming>();
  private readonly MAX_METRICS = 100;

  getStatus(): GPUBatchStatus {
    return this.status;
  }

  updateStatus(update: Partial<GPUBatchStatus>): GPUBatchStatus {
    this.status = { ...this.status, ...update };
    return this.status;
  }

  recordMetric(metric: GPUBatchMetric): void {
    this.metrics.push(metric);

    // Update archetype timings
    if (metric.gpuComputeTimeMs != null) {
      this.updateArchetypeTiming(metric);
    }

    // Trim old metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    // Sync to global for UI
    this.syncToGlobal(metric);
  }

  private updateArchetypeTiming(metric: GPUBatchMetric): void {
    const existing = this.archetypeTimings.get(metric.batchId);
    if (!existing) {
      this.archetypeTimings.set(metric.batchId, {
        avgComputeMs: metric.gpuComputeTimeMs!,
        minComputeMs: metric.gpuComputeTimeMs!,
        maxComputeMs: metric.gpuComputeTimeMs!,
        dispatchCount: 1,
        entityCount: metric.entityCount,
      });
    } else {
      const count = existing.dispatchCount + 1;
      this.archetypeTimings.set(metric.batchId, {
        avgComputeMs:
          (existing.avgComputeMs * existing.dispatchCount + metric.gpuComputeTimeMs!) / count,
        minComputeMs: Math.min(existing.minComputeMs, metric.gpuComputeTimeMs!),
        maxComputeMs: Math.max(existing.maxComputeMs, metric.gpuComputeTimeMs!),
        dispatchCount: count,
        entityCount: metric.entityCount,
      });
    }
  }

  private syncToGlobal(metric: GPUBatchMetric): void {
    if (typeof globalThis === 'undefined') return;

    const g = globalThis as any;
    if (!Array.isArray(g.__motionGPUMetrics)) {
      g.__motionGPUMetrics = [];
    }
    g.__motionGPUMetrics.push(metric);

    if (g.__motionGPUMetrics.length > this.MAX_METRICS) {
      g.__motionGPUMetrics.splice(0, g.__motionGPUMetrics.length - this.MAX_METRICS);
    }
  }

  getMetrics(): GPUBatchMetric[] {
    // Newest first
    return [...this.metrics].reverse();
  }

  clear(): void {
    this.metrics = [];
    this.archetypeTimings.clear();
  }

  seedFromLegacy(input: {
    status?: any;
    metrics?: GPUBatchMetric[];
    gpuInitialized?: boolean;
    webgpuAvailable?: boolean;
  }): void {
    const { status, metrics, gpuInitialized, webgpuAvailable } = input;

    if (status) {
      this.status = {
        ...this.status,
        enabled: status.enabled ?? status.gpuEnabled ?? this.status.enabled,
        activeEntityCount:
          status.activeEntityCount ?? status.activeCount ?? this.status.activeEntityCount,
        threshold: status.threshold ?? this.status.threshold,
      };
    }

    if (gpuInitialized !== undefined) this.status.gpuInitialized = gpuInitialized;
    if (webgpuAvailable !== undefined) this.status.webgpuAvailable = webgpuAvailable;
    if (metrics) this.metrics = [...metrics];
  }

  getArchetypeTimings(): Map<string, GPUArchetypeTiming> {
    // Return cached timings (updated incrementally on recordMetric)
    return new Map(this.archetypeTimings);
  }

  calculateDynamicThreshold(baseThreshold: number = 1000, targetFrameTime: number = 16): number {
    const current = this.status.frameTimeMs || 0;
    if (current === 0) return baseThreshold;

    const ratio = targetFrameTime / current;
    const adjusted = Math.floor(baseThreshold * ratio);
    return Math.max(200, Math.min(5000, adjusted));
  }
}

let provider: GPUMetricsProvider | null = null;
let legacyWarningIssued = false;

function seedFromLegacyIfPresent(target: GPUMetricsProvider): void {
  const g = globalThis as any;
  if (!g.__motionThresholdContext && !g.__motionGPUMetrics && g.__webgpuInitialized === undefined) {
    return;
  }

  target.seedFromLegacy({
    status: g.__motionThresholdContext,
    metrics: Array.isArray(g.__motionGPUMetrics) ? g.__motionGPUMetrics : undefined,
    gpuInitialized: g.__webgpuInitialized,
  });

  // Warn once in development about legacy globals
  if (isDev() && !legacyWarningIssued) {
    console.warn(
      'Motion detected legacy globals (__motionThresholdContext, __motionGPUMetrics, __webgpuInitialized). ' +
        'These will be deprecated in future versions. Please migrate to the new API.',
    );
    legacyWarningIssued = true;
  }
}

export function getGPUMetricsProvider(): GPUMetricsProvider {
  if (!provider) {
    provider = new InMemoryGPUMetricsProvider();
    seedFromLegacyIfPresent(provider);
  }
  return provider;
}

export function setGPUMetricsProvider(customProvider: GPUMetricsProvider): void {
  provider = customProvider;
}

export function __resetGPUMetricsProviderForTests(): void {
  provider = null;
  legacyWarningIssued = false;
}
