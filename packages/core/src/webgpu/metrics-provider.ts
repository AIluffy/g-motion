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

    // Incrementally update archetype timings if GPU timing data present
    if (metric.gpuComputeTimeMs != null) {
      const existing = this.archetypeTimings.get(metric.batchId);
      if (!existing) {
        this.archetypeTimings.set(metric.batchId, {
          avgComputeMs: metric.gpuComputeTimeMs,
          minComputeMs: metric.gpuComputeTimeMs,
          maxComputeMs: metric.gpuComputeTimeMs,
          dispatchCount: 1,
          entityCount: metric.entityCount,
        });
      } else {
        const newCount = existing.dispatchCount + 1;
        const newAvg =
          (existing.avgComputeMs * existing.dispatchCount + metric.gpuComputeTimeMs) / newCount;
        this.archetypeTimings.set(metric.batchId, {
          avgComputeMs: newAvg,
          minComputeMs: Math.min(existing.minComputeMs, metric.gpuComputeTimeMs),
          maxComputeMs: Math.max(existing.maxComputeMs, metric.gpuComputeTimeMs),
          dispatchCount: newCount,
          entityCount: metric.entityCount,
        });
      }
    }

    // Trim old metrics to maintain size limit
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    // Sync to global array for UI components (PerfPanel)
    if (typeof globalThis !== 'undefined') {
      if (!Array.isArray((globalThis as any).__motionGPUMetrics)) {
        (globalThis as any).__motionGPUMetrics = [];
      }
      const globalMetrics = (globalThis as any).__motionGPUMetrics;
      globalMetrics.push(metric);

      // Maintain size limit efficiently (batch trim to avoid frequent shifts)
      if (globalMetrics.length > this.MAX_METRICS) {
        globalMetrics.splice(0, globalMetrics.length - this.MAX_METRICS);
      }
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
        enabled: status.enabled ?? status.gpuEnabled ?? this.status.enabled,
        activeEntityCount:
          status.activeEntityCount ?? status.activeCount ?? this.status.activeEntityCount,
        threshold: status.threshold ?? this.status.threshold,
        webgpuAvailable: status.webgpuAvailable ?? this.status.webgpuAvailable,
        gpuInitialized: status.gpuInitialized ?? this.status.gpuInitialized,
      };
    }

    if (typeof gpuInitialized === 'boolean') {
      this.status.gpuInitialized = gpuInitialized;
    }
    if (typeof webgpuAvailable === 'boolean') {
      this.status.webgpuAvailable = webgpuAvailable;
    }

    if (Array.isArray(metrics)) {
      this.metrics = [...metrics];
    }
  }

  getArchetypeTimings(): Map<string, GPUArchetypeTiming> {
    // Return cached timings (updated incrementally on recordMetric)
    return new Map(this.archetypeTimings);
  }

  /**
   * Calculate dynamic GPU threshold based on frame budget and entity count
   * @param baseThreshold - Base entity count threshold (default 1000)
   * @param targetFrameTime - Target frame time in ms (default 16ms for 60fps)
   * @returns Adjusted threshold
   */
  calculateDynamicThreshold(baseThreshold: number = 1000, targetFrameTime: number = 16): number {
    const currentFrameTime = this.status.frameTimeMs || 0;
    if (currentFrameTime === 0) return baseThreshold;

    // If we're running slower than target, reduce threshold (offload more to GPU)
    // If we're running faster, increase threshold (less GPU overhead)
    const ratio = targetFrameTime / currentFrameTime;
    const adjusted = Math.floor(baseThreshold * ratio);

    // Clamp between reasonable bounds (200 min, 5000 max)
    return Math.max(200, Math.min(5000, adjusted));
  }
}

let provider: GPUMetricsProvider | null = null;
let legacyWarned = false;

function isDev(): boolean {
  const env = (globalThis as any)?.process?.env?.NODE_ENV;
  return env !== 'production';
}

function seedFromLegacyIfPresent(target: GPUMetricsProvider): void {
  const legacyStatus = (globalThis as any).__motionThresholdContext;
  const legacyMetrics = (globalThis as any).__motionGPUMetrics;
  const legacyInitialized = (globalThis as any).__webgpuInitialized;

  if (!legacyStatus && !legacyMetrics && legacyInitialized === undefined) {
    return;
  }

  target.seedFromLegacy({
    status: legacyStatus,
    metrics: Array.isArray(legacyMetrics) ? legacyMetrics : undefined,
    gpuInitialized: legacyInitialized,
  });

  if (!legacyWarned && isDev()) {
    console.warn(
      '[Motion] Detected legacy GPU globals; seeded metrics provider. Please migrate to the provider API.',
    );
    legacyWarned = true;
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
  legacyWarned = false;
}
