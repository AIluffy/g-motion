import type { PreprocessedKeyframes, WorkgroupBatchDescriptor } from './batch';

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

export interface GPUMetricsProvider {
  clear(): void;
}

export interface GPUInitResult {
  success: boolean;
  device?: unknown;
  error?: string;
}

export interface GPUResultPacket {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  values: Float32Array;
  stride?: number;
  channels?: Array<{ index: number; property: string }>;
  finished?: Uint32Array;
}
