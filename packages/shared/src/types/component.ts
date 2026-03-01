/**
 * ECS (Entity Component System) 基础类型定义
 * 包含组件值、组件定义等核心 ECS 类型
 */

/**
 * 组件值类型 - 存储在组件中的数据
 */
export type ComponentValue = Record<string, unknown>;

/**
 * 组件字段类型枚举
 */
export type ComponentType = 'float32' | 'float64' | 'int32' | 'string' | 'object';

/**
 * 组件定义 - 描述组件的 schema 结构
 */
export interface ComponentDef {
  schema: Record<string, ComponentType>;
}

/**
 * 批处理上下文 - 用于跟踪每帧批处理状态
 */
export interface BatchContext {
  lastBatchId?: string;
  entityCount?: number;
  archetypeBatchesReady?: boolean;
  timestamp?: number;
}
