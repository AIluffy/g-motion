/**
 * 动画核心类型定义
 * 包含关键帧、轨道、时间线等动画基础类型
 */

import type { TransformProperties } from '../transform/types';
import type { SpringOptions, InertiaOptions } from './physics';

/**
 * 缓动函数类型
 * - 内置名称 (如 'easeInOut', 'linear')
 * - 通过 app.registerGpuEasing() 注册的自定义缓动
 */
export type Easing = string;

/**
 * 动画状态枚举
 */
export const MotionStatus = {
  Idle: 0,
  Running: 1,
  Paused: 2,
  Completed: 3,
  Cancelled: 4,
} as const;

export type MotionStatusValue = (typeof MotionStatus)[keyof typeof MotionStatus];

/**
 * 单个关键帧定义
 */
export interface Keyframe {
  startTime: number;
  /** 绝对时间点（此关键帧结束的时间） */
  time: number;
  /** 起始值 */
  startValue: number;
  /** 结束值 */
  endValue: number;
  /** 插值类型 */
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier' | 'spring' | 'inertia';
  /** 贝塞尔曲线控制点 */
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  /** 缓动函数名称 */
  easing?: Easing;
  /** 弹簧物理参数 */
  spring?: SpringOptions;
  /** 惯性物理参数 */
  inertia?: InertiaOptions;
}

/**
 * 属性轨道 - 单个属性的关键帧数组
 */
export type Track = Keyframe[];

/**
 * 时间线数据结构 - 将属性名映射到其关键帧轨道
 */
export type TimelineData = Map<string, Track>;

/**
 * 变换组件数据 - 用于空间动画
 */
export type TransformData = TransformProperties;

/**
 * 渲染组件数据 - 存储插值后的值
 */
export interface RenderData {
  rendererId: string;
  rendererCode?: number;
  target: unknown;
  props?: Record<string, number>;
  version?: number;
  renderedVersion?: number;
}

/**
 * 动画状态组件数据 - 跟踪动画进度
 */
export interface MotionStateData {
  status: MotionStatusValue;
  startTime: number;
  currentTime: number;
  playbackRate: number;
  iteration?: number;
  delay?: number;
  pausedAt?: number;
  tickInterval?: number;
  tickPhase?: number;
  tickPriority?: number;
}

/**
 * 时间线组件数据
 */
export interface TimelineComponentData {
  tracks?: TimelineData;
  duration?: number;
  loop?: number | boolean;
  repeat?: number;
  version?: number;
  rovingApplied?: number;
}

/**
 * 速度跟踪数据 - 用于惯性/动量动画
 */
export interface VelocityData {
  values: number[];
  timestamps: number[];
  velocity: number;
  rafId?: number;
}
