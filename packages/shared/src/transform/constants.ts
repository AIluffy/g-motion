/**
 * Transform 属性常量定义
 *
 * 本文件通过组合基础属性集来定义各种 Transform 相关的属性列表，
 * 避免重复定义并确保语义一致性。
 *
 * 属性分类：
 * - 平移 (Translation): x, y, z, translateX, translateY, translateZ
 * - 旋转 (Rotation): rotate, rotateX, rotateY, rotateZ
 * - 缩放 (Scale): scale, scaleX, scaleY, scaleZ
 * - 倾斜 (Skew): skewX, skewY (仅部分系统支持)
 * - 透视 (Perspective): perspective
 */

// ============================================
// 基础属性集 (原子定义)
// ============================================

/** 基础平移属性 */
const TRANSLATE_KEYS = ['x', 'y', 'z', 'translateX', 'translateY', 'translateZ'] as const;

/** 基础旋转属性 */
const ROTATE_KEYS = ['rotate', 'rotateX', 'rotateY', 'rotateZ'] as const;

/** 基础缩放属性 */
const SCALE_KEYS = ['scale', 'scaleX', 'scaleY', 'scaleZ'] as const;

/** 倾斜属性 (仅 DOM/CSS 支持) */
const SKEW_KEYS = ['skewX', 'skewY'] as const;

/** 透视属性 */
const PERSPECTIVE_KEYS = ['perspective'] as const;

// ============================================
// 组合属性集 (由基础集派生)
// ============================================

/**
 * 基础 Transform 属性集 (不含 skew)
 * 用于: GPU Typed Buffer、ECS 组件字段定义
 * 不含 skew 是因为 GPU 计算管道通常不处理 skew 变换
 */
const BASE_TRANSFORM_KEYS = [
  ...TRANSLATE_KEYS,
  ...ROTATE_KEYS,
  ...SCALE_KEYS,
  ...PERSPECTIVE_KEYS,
] as const;

/**
 * 完整 Transform 属性集 (含 skew)
 * 用于: DOM 样式解析、CSS Transform 字符串构建
 * 包含 skewX/skewY 以支持完整的 CSS transform 功能
 */
export const TRANSFORM_KEYS = [...BASE_TRANSFORM_KEYS, ...SKEW_KEYS] as const;

/**
 * Typed Buffer Transform 属性
 * 用于: GPU Transform 组件字段 (@g-motion/core Transform 组件)
 * 与 BASE_TRANSFORM_KEYS 相同，显式声明以表达意图
 * @see packages/plugins/dom/src/renderer.ts
 */
export const TRANSFORM_TYPED_KEYS = BASE_TRANSFORM_KEYS;

// ============================================
// 系统特定属性集
// ============================================

/**
 * GPU 可加速属性列表
 * 用于: 判断属性是否可通过 GPU 计算管道处理 (@g-motion/animation visualTarget.ts)
 * 包含: 所有基础 transform 属性 + opacity
 * 排除: skew (GPU 管道暂不支持)
 */
export const GPU_CAPABLE_PROPERTIES = [...BASE_TRANSFORM_KEYS, 'opacity'] as const;

/**
 * 标准 GPU 通道属性
 * 用于: WebGPU channel mapping 和着色器 uniform 定义 (@g-motion/webgpu channel-mapping.ts)
 * 包含最常用的 transform 子集 + opacity，用于优化 GPU 内存布局
 */
export const STANDARD_GPU_CHANNEL_PROPERTIES = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'scaleY',
  'opacity',
] as const;

/**
 * 默认半精度浮点组件
 * 用于: 判断哪些组件可使用 f16 精度以节省 GPU 内存 (@g-motion/core half-float.ts)
 * 包含: 所有基础 transform 属性 + opacity
 * 排除: skew (GPU 管道暂不支持)
 */
export const DEFAULT_HALF_FLOAT_COMPONENTS = [...BASE_TRANSFORM_KEYS, 'opacity'] as const;

// ============================================
// 排除列表
// ============================================

/**
 * 应从内联样式中排除的属性列表
 * 用于: DOM 渲染器判断哪些属性不应设置到 element.style
 * 包含: 所有 transform 属性 (因为它们通过 transform 字符串统一设置)
 *
 * 注意: __primitive 等内部标记不应在此列表中，应由调用方单独处理
 */
const EXCLUDED_STYLE_KEY_LIST = ['transform', ...TRANSFORM_KEYS] as const;

/**
 * 排除的样式属性查找表
 * 用于: O(1) 快速判断属性是否需要排除
 */
export const EXCLUDED_STYLE_KEYS: Record<string, true> = Object.fromEntries(
  EXCLUDED_STYLE_KEY_LIST.map((key) => [key, true]),
) as Record<string, true>;
