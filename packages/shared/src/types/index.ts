/**
 * Motion 动画引擎共享类型定义
 *
 * 本目录只包含类型定义 (interface, type)，不包含实现代码 (class, function)。
 *
 * 类型按领域拆分为多个文件：
 * - component.ts: ECS 基础类型 (ComponentValue, ComponentDef, BatchContext)
 * - physics.ts: 物理动画选项 (SpringOptions, InertiaOptions, SpringComponentData, InertiaComponentData)
 * - animation.ts: 动画核心类型 (Keyframe, Track, TimelineData, MotionStateData, etc.)
 * - gpu-batch.ts: GPU 批处理描述符 (GPUBatchDescriptor, PhysicsBatchDescriptor, etc.)
 *
 * 注意: gpu-batch.ts 中的类型属于 GPU 实现细节，建议在 @g-motion/webgpu 中使用类型安全版本。
 */

// ECS 基础类型
export * from './component';

// 物理动画类型
export * from './physics';

// 动画核心类型
export * from './animation';

// GPU 批处理类型 (含弃用标记)
export * from './gpu-batch';
