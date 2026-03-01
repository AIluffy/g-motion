/**
 * Motion 测试工具包
 *
 * 为 Motion 动画引擎的测试用例提供测试方法和辅助函数。
 * 此包为内部测试专用，不应对外暴露。
 */

// ============================================================================
// Easing 测试工具
// ============================================================================

import type { EasingRegistry as EasingRegistryType } from '@g-motion/shared';

/**
 * 重置所有自定义缓动函数（仅测试使用）
 * 清除 globalEasingRegistry 中的所有自定义 easing 并重置状态，包括 ID 计数器
 * @param registry - EasingRegistry 实例
 */
export function __resetCustomEasings(registry: EasingRegistryType): void {
  registry.hardReset(100);
}

// ============================================================================
// Debug 测试工具
// ============================================================================

import type { DebugController as DebugControllerType } from '@g-motion/shared';

/**
 * 清除所有调试器缓存（仅测试使用）
 * @param controller - DebugController 实例
 */
export function _clearDebuggerCache(controller: DebugControllerType): void {
  controller.reset();
}

// ============================================================================
// 时间相关测试工具
// ============================================================================

/**
 * 等待指定毫秒数
 * @param ms - 等待时间（毫秒）
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建一个受控的时间推进器
 * 用于测试中精确控制时间的流逝
 */
export interface TimeController {
  /** 当前模拟时间（毫秒） */
  now(): number;
  /** 推进时间（毫秒） */
  advance(ms: number): number;
  /** 重置到初始状态 */
  reset(): void;
}

/**
 * 创建时间控制器
 * @param startTime - 初始时间（默认 0）
 */
export function createTimeController(startTime = 0): TimeController {
  let currentTime = startTime;

  return {
    now: () => currentTime,
    advance: (ms: number) => {
      currentTime += ms;
      return currentTime;
    },
    reset: () => {
      currentTime = startTime;
    },
  };
}

// ============================================================================
// Mock 工具
// ============================================================================

/**
 * 简单的 requestAnimationFrame polyfill
 * 用于 Node 测试环境
 */
export function mockRaf(): void {
  if (!(globalThis as unknown as Record<string, unknown>).requestAnimationFrame) {
    (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = (
      cb: FrameRequestCallback,
    ) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  }

  if (!(globalThis as unknown as Record<string, unknown>).cancelAnimationFrame) {
    (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
      clearTimeout(id);
  }
}

/**
 * 清除 rAF polyfill
 */
export function clearMockRaf(): void {
  // 清理由 mockRaf 设置的 polyfill
  // 实际清理通常在测试框架的 afterEach 中完成
}

// ============================================================================
// DOM 相关测试工具
// ============================================================================

/**
 * 创建一个带有样式的 mock DOM 元素
 * @param tagName - 元素标签名
 * @param styles - 初始样式
 */
export function createMockElement(
  tagName: string,
  styles: Partial<CSSStyleDeclaration> = {},
): HTMLElement {
  const element = document.createElement(tagName);
  Object.assign(element.style, styles);
  return element;
}

/**
 * 模拟 getBoundingClientRect 的返回值
 * @param element - 目标元素
 * @param rect - 要返回的 DOMRect
 */
export function mockBoundingClientRect(element: Element, rect: Partial<DOMRect>): void {
  // 此函数需要在测试环境中使用 vi.spyOn 实现
  // 示例: vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect as DOMRect)
  void element;
  void rect;
}

// ============================================================================
// GPU 相关测试工具
// ============================================================================

/**
 * 检查当前环境是否支持 WebGPU
 */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * WebGPU mock 对象类型
 */
export interface WebGPUMock {
  requestAdapter: () => Promise<null>;
  getPreferredCanvasFormat: () => string;
  wgslLanguageFeatures: Set<string>;
}

/**
 * 创建 WebGPU mock 适配器
 * 用于在不支持 WebGPU 的环境中测试
 */
export function createWebGPUMock(): WebGPUMock {
  // 返回一个基本的 GPU mock 对象
  // 实际实现根据测试需求定制
  return {
    requestAdapter: () => Promise.resolve(null),
    getPreferredCanvasFormat: () => 'bgra8unorm',
    wgslLanguageFeatures: new Set(),
  };
}

// ============================================================================
// 性能测试工具
// ============================================================================

/**
 * 测量函数执行时间
 * @param fn - 要测量的函数
 * @param iterations - 迭代次数（默认 1）
 * @returns 平均执行时间（毫秒）
 */
export function measurePerformance(fn: () => void, iterations = 1): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  return (end - start) / iterations;
}

/**
 * Spy 函数接口
 */
export interface SpyFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T>;
  calls: unknown[][];
  callCount: number;
  reset(): void;
}

/**
 * 创建一个可监控调用次数的 spy 函数
 * @param impl - 可选的实现函数
 */
export function createSpy<T extends (...args: unknown[]) => unknown>(impl?: T): SpyFunction<T> {
  const calls: unknown[][] = [];

  const spy = function (this: unknown, ...args: unknown[]): ReturnType<T> | undefined {
    calls.push(args);
    return impl ? (impl.apply(this, args) as ReturnType<T>) : undefined;
  };

  Object.defineProperty(spy, 'calls', {
    get: () => calls,
    enumerable: true,
    configurable: true,
  });

  Object.defineProperty(spy, 'callCount', {
    get: () => calls.length,
    enumerable: true,
    configurable: true,
  });

  (spy as unknown as { reset: () => void }).reset = () => {
    calls.length = 0;
  };

  return spy as unknown as SpyFunction<T>;
}
