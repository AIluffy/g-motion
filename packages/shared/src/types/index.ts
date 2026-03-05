/**
 * Motion 动画引擎共享类型定义
 *
 * 本目录只包含类型定义 (interface, type)，不包含实现代码 (class, function)。
 *
 * 类型按领域拆分为多个文件：
 * - component.ts: ECS 基础类型 (ComponentValue, ComponentDef, BatchContext)
 * - animation.ts: 动画核心类型（已迁移到 @g-motion/protocol，shared 仅保留兼容转发）
 * - gpu-batch.ts: 批处理基础类型（已迁移到 @g-motion/protocol，shared 仅保留兼容转发）
 * - compute.ts: 计算抽象类型（已迁移到 @g-motion/protocol，shared 仅保留兼容转发）
 *
 * 注意: gpu-batch.ts 中的类型属于 GPU 实现细节，建议在 @g-motion/webgpu 中使用类型安全版本。
 */

// ECS 基础类型
export * from './component';

/** @deprecated Import from '@g-motion/protocol' instead. */
export type {
  SpringOptions,
  InertiaOptions,
  SpringComponentData,
  InertiaComponentData,
} from '@g-motion/protocol';

// 动画核心类型（兼容转发）
export * from './animation';

// GPU 批处理类型（兼容转发）
export * from './gpu-batch';

// 计算能力抽象（兼容转发）
export * from './compute';
