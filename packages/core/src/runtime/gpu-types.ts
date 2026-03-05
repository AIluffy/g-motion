import type { PreprocessedKeyframes, WorkgroupBatchDescriptor } from '@g-motion/shared';

export interface RawKeyframeGenerationOptions {
  timeInterval: number;
  maxSubdivisionsPerSegment?: number;
}

export type RawKeyframeValueEvaluator = (
  keyframe: {
    startTime: number;
    time: number;
    startValue: number;
    endValue: number;
    easing: unknown;
  },
  t: number,
) => number;

export interface GPUBatchDescriptor extends WorkgroupBatchDescriptor {
  kind?: 'interpolation';
  archetypeId: string;
  entityIds: ArrayLike<number>;
  entityCount: number;
  entityIdsLeaseId?: number;
  statesData: Float32Array;
  keyframesData: Float32Array;
  statesVersion?: number;
  keyframesVersion?: number;
  entitySig?: number;
  preprocessedKeyframes?: PreprocessedKeyframes;
  createdAt: number;
}

export interface PhysicsBatchDescriptor extends WorkgroupBatchDescriptor {
  kind: 'physics';
  archetypeId: string;
  entityIds: ArrayLike<number>;
  entityCount: number;
  entityIdsLeaseId?: number;
  physics: {
    baseArchetypeId: string;
    stride: number;
    channels: Array<{ index: number; property: string }>;
    slotCount: number;
    stateData?: Float32Array;
    stateVersion?: number;
  };
  createdAt: number;
  statesData?: Float32Array;
  keyframesData?: Float32Array;
  keyframesVersion?: number;
  preprocessedKeyframes?: PreprocessedKeyframes;
}

export type ArchetypeBatchDescriptor = GPUBatchDescriptor | PhysicsBatchDescriptor;

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
    status?: unknown;
    metrics?: GPUBatchMetric[];
    gpuInitialized?: boolean;
    webgpuAvailable?: boolean;
  }): void;
  getArchetypeTimings(): Map<string, GPUArchetypeTiming>;
  calculateDynamicThreshold(baseThreshold?: number, targetFrameTime?: number): number;
}
