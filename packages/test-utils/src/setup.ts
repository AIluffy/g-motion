/**
 * Motion 测试环境 Setup
 *
 * 此文件用于配置 vitest 测试环境的初始设置。
 * 在 vitest.config.ts 中通过 test.setupFiles 引用。
 *
 * @example
 * // vitest.config.ts
 * export default defineConfig({
 *   test: {
 *     setupFiles: ['@g-motion/test-utils/setup'],
 *   },
 * });
 */

// ============================================================================
// requestAnimationFrame Polyfill
// ============================================================================

if (typeof globalThis !== 'undefined') {
  if (!('requestAnimationFrame' in globalThis)) {
    (globalThis as Record<string, unknown>).requestAnimationFrame = (
      callback: FrameRequestCallback,
    ): number => {
      return setTimeout(() => callback(Date.now()), 16) as unknown as number;
    };
  }

  if (!('cancelAnimationFrame' in globalThis)) {
    (globalThis as Record<string, unknown>).cancelAnimationFrame = (handle: number): void => {
      clearTimeout(handle);
    };
  }
}

// ============================================================================
// performance.now Polyfill
// ============================================================================

if (typeof globalThis !== 'undefined' && !('performance' in globalThis)) {
  const startTime = Date.now();
  (globalThis as Record<string, unknown>).performance = {
    now: () => Date.now() - startTime,
  };
}

// ============================================================================
// 全局测试工具挂载（可选）
// ============================================================================

// 如果需要，可以在这里挂载一些全局测试工具
// 例如: globalThis.testUtils = { wait, createTimeController, ... };
