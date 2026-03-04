import { createDebugger, isDev } from '@g-motion/shared';
import type { OutputFormatPoolStats } from '../output-format';

const debug = createDebugger('GPUMetrics');
const warn = createDebugger('GPUMetrics', 'warn');

export interface GPUBatchStatus {
  enabled: boolean;
  activeEntityCount: number;
  threshold: number;
  webgpuAvailable: boolean;
  gpuInitialized: boolean;
  timeoutRate?: number;
  frameTimeMs?: number;
  queueDepth?: number;
  memoryUsageBytes?: number;
  peakMemoryUsageBytes?: number;
  memoryUsageThresholdBytes?: number;
  memoryAlertActive?: boolean;
  outputFormatPoolStats?: OutputFormatPoolStats;
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
  syncExpired?: boolean;
  syncTimeoutRate?: number;
  syncQueueDepth?: number;
  // GPU Compute timing (via timestamp queries)
  gpuComputeTimeMs?: number;
  gpuComputeTimeNs?: number;
  workgroupsDispatched?: number;
  workgroupSize?: number;
}

export interface GPUArchetypeTiming {
  avgComputeMs: number;
  minComputeMs: number;
  maxComputeMs: number;
  dispatchCount: number;
  entityCount: number;
}

export interface SystemTimingStat {
  avgMs: number;
  minMs: number;
  maxMs: number;
  count: number;
  lastMs: number;
}

export interface GPUMemoryStats {
  bytesSkipped: number;
  totalBytesProcessed: number;
  currentMemoryUsage: number;
  peakMemoryUsage: number;
  timestamp: number;
}

export interface GPUMetricsProvider {
  getStatus(): GPUBatchStatus;
  updateStatus(update: Partial<GPUBatchStatus>): GPUBatchStatus;
  recordMetric(metric: GPUBatchMetric): void;
  getMetrics(): GPUBatchMetric[];
  recordSystemTiming?(name: string, durationMs: number): void;
  getSystemTimings?(): Record<string, SystemTimingStat>;
  recordMemorySnapshot?(snapshot: GPUMemoryStats): void;
  getMemoryHistory?(): GPUMemoryStats[];
  getLatestMemorySnapshot?(): GPUMemoryStats | null;
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
  private systemTimings = new Map<string, SystemTimingStat>();
  private readonly MAX_METRICS = 100;
  private readonly MAX_SYSTEM_TIMINGS = 64;
  private memoryHistory: GPUMemoryStats[] = [];
  private readonly MAX_MEMORY_HISTORY = 300;
  private lastMemoryLogTime = 0;

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
  }

  recordSystemTiming(name: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;

    const existing = this.systemTimings.get(name);
    if (!existing) {
      if (this.systemTimings.size >= this.MAX_SYSTEM_TIMINGS) {
        const first = this.systemTimings.keys().next().value as string | undefined;
        if (first) this.systemTimings.delete(first);
      }
      this.systemTimings.set(name, {
        avgMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
        count: 1,
        lastMs: durationMs,
      });
      return;
    }

    const nextCount = existing.count + 1;
    this.systemTimings.set(name, {
      avgMs: (existing.avgMs * existing.count + durationMs) / nextCount,
      minMs: Math.min(existing.minMs, durationMs),
      maxMs: Math.max(existing.maxMs, durationMs),
      count: nextCount,
      lastMs: durationMs,
    });
  }

  getSystemTimings(): Record<string, SystemTimingStat> {
    const out: Record<string, SystemTimingStat> = {};
    for (const [name, stat] of this.systemTimings) {
      out[name] = stat;
    }
    return out;
  }

  recordMemorySnapshot(snapshot: GPUMemoryStats): void {
    this.memoryHistory.push(snapshot);
    if (this.memoryHistory.length > this.MAX_MEMORY_HISTORY) {
      this.memoryHistory.shift();
    }

    this.status = {
      ...this.status,
      memoryUsageBytes: snapshot.currentMemoryUsage,
      peakMemoryUsageBytes: snapshot.peakMemoryUsage,
    };

    const threshold = this.status.memoryUsageThresholdBytes;
    const overThreshold =
      typeof threshold === 'number' && threshold > 0 && snapshot.currentMemoryUsage > threshold;

    if (overThreshold) {
      this.status = {
        ...this.status,
        memoryAlertActive: true,
      };
      if (isDev()) {
        warn('GPU memory usage exceeded threshold', {
          usage: snapshot.currentMemoryUsage,
          peak: snapshot.peakMemoryUsage,
          threshold,
        });
      }
    } else if (this.status.memoryAlertActive) {
      this.status = {
        ...this.status,
        memoryAlertActive: false,
      };
    }

    const now = snapshot.timestamp;
    if (!Number.isFinite(now)) {
      return;
    }
    if (now - this.lastMemoryLogTime >= 5000) {
      this.lastMemoryLogTime = now;
      debug('GPU memory stats', snapshot);
    }
  }

  getMemoryHistory(): GPUMemoryStats[] {
    return [...this.memoryHistory];
  }

  getLatestMemorySnapshot(): GPUMemoryStats | null {
    if (this.memoryHistory.length === 0) {
      return null;
    }
    return this.memoryHistory[this.memoryHistory.length - 1];
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

  getMetrics(): GPUBatchMetric[] {
    // Newest first
    return [...this.metrics].reverse();
  }

  clear(): void {
    this.metrics = [];
    this.archetypeTimings.clear();
    this.systemTimings.clear();
    this.memoryHistory = [];
    this.status = { ...DEFAULT_STATUS };
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

let defaultProvider: GPUMetricsProvider | null = null;

export function createGPUMetricsProvider(): GPUMetricsProvider {
  return new InMemoryGPUMetricsProvider();
}

export function setDefaultGPUMetricsProvider(customProvider: GPUMetricsProvider | null): void {
  defaultProvider = customProvider;
}

export function getGPUMetricsProvider(): GPUMetricsProvider {
  if (!defaultProvider) {
    defaultProvider = new InMemoryGPUMetricsProvider();
  }
  return defaultProvider;
}

export function setGPUMetricsProvider(customProvider: GPUMetricsProvider): void {
  defaultProvider = customProvider;
}

export function __resetGPUMetricsProviderForTests(): void {
  defaultProvider = null;
}
