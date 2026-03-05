import type { GPUMetricsProvider as ProtocolGPUMetricsProvider } from '@g-motion/protocol';

export type {
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
  ArchetypeBatchDescriptor,
} from '@g-motion/protocol';

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
  outputFormatPoolStats?: any;
}

export interface GPUBatchMetric {
  batchId: string;
  entityCount: number;
  timestamp: number;
  gpu: boolean;
  syncPerformed?: boolean;
  syncDurationMs?: number;
  syncDataSize?: number;
  syncExpired?: boolean;
  syncTimeoutRate?: number;
  syncQueueDepth?: number;
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

export interface GPUMetricsProvider extends ProtocolGPUMetricsProvider {
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
    status?: unknown;
    metrics?: GPUBatchMetric[];
    gpuInitialized?: boolean;
    webgpuAvailable?: boolean;
  }): void;
  getArchetypeTimings(): Map<string, GPUArchetypeTiming>;
  calculateDynamicThreshold(baseThreshold?: number, targetFrameTime?: number): number;
}
