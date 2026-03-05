/**
 * WebGPU 批处理描述符类型定义
 *
 * 使用正确的 WebGPU API 类型（GPUBuffer, GPUBindGroup）替代 any，
 * 提供类型安全的 GPU 批处理配置。
 */

import type {
  PreprocessedKeyframes,
  LeasedBatchDescriptor,
  ArchetypeBatchDescriptor as ProtocolArchetypeBatchDescriptor,
  GPUBatchDescriptor as ProtocolGPUBatchDescriptor,
  PhysicsBatchDescriptor as ProtocolPhysicsBatchDescriptor,
} from '@g-motion/protocol';
export type { RawKeyframeGenerationOptions, RawKeyframeValueEvaluator } from '@g-motion/protocol';

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
export interface GPUBatchDescriptor extends ProtocolGPUBatchDescriptor {
  /** GPU 缓冲区集合 */
  gpuBuffers?: GPUBatchBuffers;
  /** WebGPU 绑定组 */
  bindGroup?: GPUBindGroup;
}

/**
 * 物理批处理描述符
 * 用于物理动画（弹簧、惯性）计算
 */
export interface PhysicsBatchDescriptor extends ProtocolPhysicsBatchDescriptor {
  /** GPU 缓冲区集合 */
  gpuBuffers?: GPUBatchBuffers;
  /** WebGPU 绑定组 */
  bindGroup?: GPUBindGroup;
}

/**
 * 原型批处理描述符联合类型
 */
export type ArchetypeBatchDescriptor = ProtocolArchetypeBatchDescriptor &
  (GPUBatchDescriptor | PhysicsBatchDescriptor);

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
