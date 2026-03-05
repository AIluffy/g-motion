/**
 * WebGPU 批处理描述符类型定义
 *
 * 使用正确的 WebGPU API 类型（GPUBuffer, GPUBindGroup）替代 any，
 * 提供类型安全的 GPU 批处理配置。
 */

import type {
  PreprocessedKeyframes,
  LeasedBatchDescriptor,
  WorkgroupBatchDescriptor,
} from '@g-motion/shared';

/**
 * GPU Buffer 集合
 * 包含状态、关键帧和输出缓冲区
 */
export interface GPUBatchBuffers {
  /** 动画状态缓冲区 (entity states) */
  statesBuffer: GPUBuffer;
  /** 关键帧数据缓冲区 */
  keyframesBuffer: GPUBuffer;
  /** 计算结果输出缓冲区 */
  outputBuffer: GPUBuffer;
}

/**
 * GPU 批处理描述符
 * 用于标准动画插值计算
 */
export interface GPUBatchDescriptor extends WorkgroupBatchDescriptor {
  kind?: 'interpolation';
  /** 原型 ID */
  archetypeId: string;
  /** 实体 ID 列表 */
  entityIds: ArrayLike<number>;
  /** 实体数量 */
  entityCount: number;
  /** 实体 ID 缓冲区租赁 ID */
  entityIdsLeaseId?: number;
  /** 动画状态数据 */
  statesData: Float32Array;
  /** 关键帧数据 */
  keyframesData: Float32Array;
  /** 状态数据版本号 */
  statesVersion?: number;
  /** 关键帧数据版本号 */
  keyframesVersion?: number;
  /** 实体签名 */
  entitySig?: number;
  /** 预处理后关键帧数据 */
  preprocessedKeyframes?: PreprocessedKeyframes;
  /** GPU 缓冲区集合 */
  gpuBuffers?: GPUBatchBuffers;
  /** WebGPU 绑定组 */
  bindGroup?: GPUBindGroup;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 物理批处理描述符
 * 用于物理动画（弹簧、惯性）计算
 */
export interface PhysicsBatchDescriptor extends WorkgroupBatchDescriptor {
  kind: 'physics';
  /** 原型 ID */
  archetypeId: string;
  /** 实体 ID 列表 */
  entityIds: ArrayLike<number>;
  /** 实体数量 */
  entityCount: number;
  /** 实体 ID 缓冲区租赁 ID */
  entityIdsLeaseId?: number;
  /** 物理配置 */
  physics: {
    /** 基础原型 ID */
    baseArchetypeId: string;
    /** 状态数据步长 */
    stride: number;
    /** 通道配置 */
    channels: Array<{ index: number; property: string }>;
    /** 槽位数量 */
    slotCount: number;
    /** 状态数据 */
    stateData?: Float32Array;
    /** 状态数据版本 */
    stateVersion?: number;
  };
  /** 创建时间戳 */
  createdAt: number;
  /** 可选状态数据（与 physics.stateData 冗余，保留以兼容旧代码） */
  statesData?: Float32Array;
  /** 可选关键帧数据 */
  keyframesData?: Float32Array;
  /** 关键帧数据版本 */
  keyframesVersion?: number;
  /** 预处理后关键帧数据 */
  preprocessedKeyframes?: PreprocessedKeyframes;
  /** GPU 缓冲区集合 */
  gpuBuffers?: GPUBatchBuffers;
  /** WebGPU 绑定组 */
  bindGroup?: GPUBindGroup;
}

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

/**
 * 原型批处理描述符联合类型
 */
export type ArchetypeBatchDescriptor = GPUBatchDescriptor | PhysicsBatchDescriptor;

/**
 * 关键帧预处理批处理描述符
 */
export type KeyframePreprocessBatchDescriptor = {
  archetypeId: string;
  preprocessedKeyframes: PreprocessedKeyframes;
  keyframesVersion?: number;
};

/**
 * 带预处理关键帧的 GPU 批处理
 */
export type GPUBatchWithPreprocessedKeyframes = GPUBatchDescriptor & {
  preprocessedKeyframes: PreprocessedKeyframes;
};

/**
 * 视口裁剪批处理描述符
 */
export interface ViewportCullingBatchDescriptor extends LeasedBatchDescriptor {
  statesData: Float32Array;
}

/**
 * GPU 批处理上下文
 */
export interface GPUBatchContextWithArchetypes {
  archetypeBatches: Map<string, ArchetypeBatchDescriptor>;
  timestamp: number;
  archetypeBatchesReady?: boolean;
}

export type DeviceInitResult =
  | { ok: true; device: GPUDevice; adapter: GPUAdapter; limits: GPUSupportedLimits }
  | {
      ok: false;
      reason: 'no-webgpu' | 'no-adapter' | 'no-device' | 'device-lost';
      message: string;
    };
