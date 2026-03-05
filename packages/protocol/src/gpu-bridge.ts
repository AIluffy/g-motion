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

export interface GPUResultQueueCapability {
  getGPUResultQueueLength?(): number;
  getPendingReadbackCount?(): number;
  setGPUResultWakeup?(wakeup?: () => void): void;
}

export interface GPUWorkgroupCapability {
  selectWorkgroupSize?(archetypeId: string, entityCount: number): number;
  setForcedWorkgroupSize?(size: number | null): void;
  consumeForcedGPUStateSyncEntityIdsSet?(): Set<number>;
}

export interface GPUPhysicsCapability {
  isPhysicsGPUEntity?(entityId: number): boolean;
}

export interface GPUChannelCapability {
  getGPUChannelMappingRegistry(): {
    getChannels(archetypeId: string): unknown;
  };
}

export interface GPUBufferCapability {
  getPersistentGPUBufferManager(device?: GPUDevice): {
    getStats(): unknown;
  };
}

export type GPUComputeCapability =
  GPUResultQueueCapability &
  GPUWorkgroupCapability &
  GPUPhysicsCapability &
  GPUChannelCapability &
  GPUBufferCapability;

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
