type GPUDevice = unknown;

export interface GPUBridge {
  readonly isAvailable: boolean;
  initialize(config?: Record<string, unknown>): Promise<GPUInitResult>;
  dispatchBatch(batch: GPUBatchRequest): Promise<void>;
  dispatchPhysicsBatch(batch: GPUPhysicsBatchRequest): Promise<void>;
  drainResults(): GPUResultEntry[];
  getMetrics(): GPUMetrics;
  selectWorkgroupSize(entityCount: number): number;
  destroy(): void;
  reset(): void;
}

export interface GPUComputeCapability {
  getGPUResultQueueLength?(): number;
  getPendingReadbackCount?(): number;
  setGPUResultWakeup?(wakeup?: () => void): void;
  getPersistentGPUBufferManager(device?: GPUDevice): {
    getStats(): {
      bytesSkipped?: number;
      totalBytesProcessed?: number;
      currentMemoryUsage?: number;
      peakMemoryUsage?: number;
      totalMemoryBytes?: number;
    };
  };
  selectWorkgroupSize?(archetypeId: string, entityCount: number): number;
  setForcedWorkgroupSize?(size: number | null): void;
  consumeForcedGPUStateSyncEntityIdsSet?(): Set<number>;
  isPhysicsGPUEntity?(entityId: number): boolean;
  getGPUChannelMappingRegistry(): {
    getChannels(archetypeId: string):
      | {
          stride: number;
          rawStride?: number;
          channels: Array<{ index: number; property: string }>;
          rawChannels?: Array<{ index: number; property: string }>;
        }
      | undefined;
  };
}

export interface GPUInitResult {
  success: boolean;
  device?: unknown;
  error?: string;
}

export interface GPUBatchRequest {
  archetypeId: string;
  entityCount: number;
  statesBuffer: Float32Array;
  keyframesBuffer: Float32Array;
  outputBuffer: Float32Array;
  [key: string]: unknown;
}

export interface GPUPhysicsBatchRequest {
  type: 'spring' | 'inertia';
  entityCount: number;
  stateBuffer: Float32Array;
  paramBuffer: Float32Array;
  [key: string]: unknown;
}

export interface GPUResultEntry {
  archetypeId: string;
  entityIds: number[];
  values: Float32Array;
  channelMapping?: unknown;
}

export interface GPUMetrics {
  clear(): void;
  [key: string]: unknown;
}
