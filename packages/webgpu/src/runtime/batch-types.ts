/**
 * GPU 批处理相关类型定义
 *
 * 注意: 基础批处理类型保留在 shared 包中，因为它们是跨层通用的数据结构。
 * GPU 特定扩展类型（使用 GPUBuffer/GPUBindGroup）已迁移到 @g-motion/webgpu。
 *
 * 类型分层:
 * - shared: 基础类型 (PreprocessedKeyframes, BatchDescriptor, LeasedBatchDescriptor, WorkgroupBatchDescriptor)
 * - webgpu: GPU 扩展类型 (GPUBatchDescriptor, PhysicsBatchDescriptor, GPUBatchBuffers)
 *
 * 使用指南:
 * 1. 基础批处理类型 (BatchDescriptor, LeasedBatchDescriptor, WorkgroupBatchDescriptor)
 *    - 位置: @g-motion/shared
 *    - 用途: ECS 批处理系统、实体收集器、批处理协调器
 *    - 这些类型不包含 GPU 特定字段，可在 CPU-only 场景使用
 *
 * 2. GPU 特定类型 (GPUBatchDescriptor, PhysicsBatchDescriptor, ArchetypeBatchDescriptor)
 *    - 位置: @g-motion/webgpu
 *    - 用途: WebGPU 计算管道、调度系统
 *    - 使用正确的 GPUBuffer 和 GPUBindGroup 类型替代 any
 *
 * 迁移示例:
 * ```typescript
 * // 旧代码 (shared - 使用 any 类型)
 * import type { GPUBatchDescriptor } from '@g-motion/shared';
 * // gpuBuffers: { statesBuffer: any; keyframesBuffer: any; outputBuffer: any }
 * // bindGroup: any
 *
 * // 新代码 (webgpu - 类型安全)
 * import type { GPUBatchDescriptor } from '@g-motion/webgpu';
 * // gpuBuffers: { statesBuffer: GPUBuffer; keyframesBuffer: GPUBuffer; outputBuffer: GPUBuffer }
 * // bindGroup: GPUBindGroup
 * ```
 */

/**
 * 预处理后关键帧数据
 * 用于 GPU 关键帧预处理管道，存储已格式化的关键帧数据
 */
export type PreprocessedKeyframes = {
  /** 每个实体的原始关键帧数据 */
  rawKeyframesPerEntity: Float32Array[];
  /** 每个实体的通道映射 */
  channelMapPerEntity: Uint32Array[];
  /** 剪辑模型（用于复杂动画） */
  clipModel?: {
    rawKeyframesByClip: Float32Array[];
    channelMapByClip: Uint32Array[];
    clipIndexByEntity: Uint32Array;
  };
};

/**
 * 基础批处理描述符
 * 定义一批需要处理的实体的基本信息
 *
 * 注意: 这是一个基础类型，GPU 特定扩展在 @g-motion/webgpu 中定义
 * @see packages/webgpu/src/types.ts GPUBatchDescriptor
 */
export interface BatchDescriptor {
  /** 原型 ID（实体类型标识） */
  archetypeId: string;
  /** 实体 ID 列表 */
  entityIds: ArrayLike<number>;
  /** 实体数量 */
  entityCount: number;
}

/**
 * 带租赁 ID 的批处理描述符
 * 用于缓冲区租赁系统，跟踪实体 ID 缓冲区的租赁状态
 *
 * 注意: 这是一个基础类型，GPU 特定扩展在 @g-motion/webgpu 中定义
 */
export interface LeasedBatchDescriptor extends BatchDescriptor {
  /** 实体 ID 缓冲区租赁 ID */
  entityIdsLeaseId?: number;
}

/**
 * 带工作组提示的批处理描述符
 * 用于 GPU 计算管道，提示合适的 GPU 工作组大小
 *
 * 注意: 这是一个基础类型，GPU 特定扩展在 @g-motion/webgpu 中定义
 * @see packages/webgpu/src/types.ts GPUBatchDescriptor
 */
export interface WorkgroupBatchDescriptor extends LeasedBatchDescriptor {
  /** 工作组大小提示（如 64, 128, 256） */
  workgroupHint: number;
}

/**
 * 关键帧预处理批处理描述符
 */
export type KeyframePreprocessBatchDescriptor = {
  archetypeId: string;
  preprocessedKeyframes: PreprocessedKeyframes;
  keyframesVersion?: number;
};

/**
 * 视口裁剪批处理描述符
 */
export interface ViewportCullingBatchDescriptor extends LeasedBatchDescriptor {
  statesData: Float32Array;
}
