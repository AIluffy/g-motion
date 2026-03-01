/**
 * 物理动画类型定义
 * 包含弹簧和惯性动画的配置选项
 */

/**
 * 弹簧动画参数
 */
export interface SpringOptions {
  /** 刚度系数 */
  stiffness?: number;
  /** 阻尼系数 */
  damping?: number;
  /** 质量 */
  mass?: number;
  /** 静止速度阈值 */
  restSpeed?: number;
  /** 静止距离阈值 */
  restDelta?: number;
  /** 初始速度 */
  initialVelocity?: number;
}

/**
 * 惯性动画选项 (参考 GSAP InertiaPlugin)
 * 支持简单的速度值和高级配置
 */
export interface InertiaOptions {
  /** 速度 (可以是数值、'auto' 表示跟踪属性，或函数) */
  velocity?: number | 'auto' | (() => number);
  /**
   * 'auto' 模式下的自定义速度获取器
   * @param track - 轨道属性名
   * @param ctx.target - 动画目标对象 (DOM 元素、普通对象或原始值)
   */
  velocitySource?: (track: string, ctx: { target: unknown }) => number;

  /** 最小结束值 */
  min?: number;
  /** 最大结束值 */
  max?: number;
  /** 边界约束的另一种写法 */
  bounds?: { min?: number; max?: number };

  /** 碰到边界时钳制而非反弹 */
  clamp?: boolean;

  /**
   * 减速度 (基于毫秒)
   * 如果提供，映射到 timeConstant = 1000 / deceleration
   */
  deceleration?: number;

  /** 阻力系数 */
  resistance?: number;
  /** 持续时间 */
  duration?: number | { min: number; max: number };

  /** 反弹参数 (碰到边界时) */
  bounce?: false | { stiffness?: number; damping?: number; mass?: number };

  /** 完成阈值 - 速度阈值 (默认: 0.5 units/sec) */
  restSpeed?: number;
  /** 完成阈值 - 距离阈值 (默认: 0.5) */
  restDelta?: number;
}

/**
 * 弹簧组件数据
 */
export interface SpringComponentData {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
}

/**
 * 惯性组件数据
 */
export interface InertiaComponentData {
  timeConstant?: number;
  min?: number;
  max?: number;
  bounds?: { min?: number; max?: number };
  clamp?: boolean | number;
  bounce?: false | { stiffness?: number; damping?: number; mass?: number };
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
}
