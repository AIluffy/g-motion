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

let _gpuBridge: GPUBridge | null = null;

export function registerGPUBridge(bridge: GPUBridge): void {
  _gpuBridge = bridge;
}

export function getGPUBridge(): GPUBridge | null {
  return _gpuBridge;
}

export function requireGPUBridge(): GPUBridge {
  if (!_gpuBridge) {
    throw new Error(
      'GPUBridge not registered. Install @g-motion/webgpu and call registerGPUBridge().',
    );
  }
  return _gpuBridge;
}

export function clearGPUBridge(): void {
  _gpuBridge = null;
}
