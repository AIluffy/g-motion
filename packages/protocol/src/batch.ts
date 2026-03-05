export type PreprocessedKeyframes = {
  rawKeyframesPerEntity: Float32Array[];
  channelMapPerEntity: Uint32Array[];
  clipModel?: {
    rawKeyframesByClip: Float32Array[];
    channelMapByClip: Uint32Array[];
    clipIndexByEntity: Uint32Array;
  };
};

export interface BatchDescriptor {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  entityCount: number;
}

export interface LeasedBatchDescriptor extends BatchDescriptor {
  entityIdsLeaseId?: number;
}

export interface WorkgroupBatchDescriptor extends LeasedBatchDescriptor {
  workgroupHint: number;
}

export type KeyframePreprocessBatchDescriptor = {
  archetypeId: string;
  preprocessedKeyframes: PreprocessedKeyframes;
  keyframesVersion?: number;
};

export interface ViewportCullingBatchDescriptor extends LeasedBatchDescriptor {
  statesData: Float32Array;
}
