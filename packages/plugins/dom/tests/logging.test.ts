/**
 * Test suite for logging behavior in DOM renderer
 * Verifies that console.debug is not called by default in hot paths
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { globalDebugController } from '@g-motion/shared';
import { createDOMRenderer } from '../src/renderer';

describe('DOMRenderer Logging', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let originalDebugFlag: string | undefined;

  beforeEach(() => {
    globalDebugController.reset();
    consoleDebugSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Save original __MOTION_DEBUG_LEVEL__ flag
    originalDebugFlag = (globalThis as any).__MOTION_DEBUG_LEVEL__;
    // Ensure debug is off by default
    delete (globalThis as any).__MOTION_DEBUG_LEVEL__;
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    // Restore original flag
    if (originalDebugFlag !== undefined) {
      (globalThis as any).__MOTION_DEBUG_LEVEL__ = originalDebugFlag;
    } else {
      delete (globalThis as any).__MOTION_DEBUG_LEVEL__;
    }
  });

  test('should not call console.debug by default in production-like mode', () => {
    // Simulate production environment
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const renderer = createDOMRenderer();

    // Creating renderer should not log by default in production
    expect(consoleDebugSpy).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  test('should log when __MOTION_DEBUG__ is enabled', () => {
    // Enable debug flag - use the correct global that the DebugController checks
    (globalThis as any).__MOTION_DEBUG_LEVEL__ = 'verbose';

    // Simulate production environment
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const renderer = createDOMRenderer();

    // Creating renderer should log when debug flag is on
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Motion][DOMRenderer]'),
      'created with config:',
      expect.objectContaining({
        forceGPUAcceleration: true,
        enableWillChange: true,
        useHardwareAcceleration: true,
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  test('should not flood console in hot-path operations', () => {
    // Simulate production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const renderer = createDOMRenderer();
    consoleDebugSpy.mockClear();

    // Create a mock element
    const mockElement = document.createElement('div');
    const components = {
      Render: { props: { opacity: 0.5 } },
      Transform: { x: 100, y: 50 },
    };

    // Call preFrame
    renderer.preFrame?.();

    // Simulate 100 update calls (hot path)
    for (let i = 0; i < 100; i++) {
      renderer.update(i, mockElement, components);
    }

    // Call postFrame
    renderer.postFrame?.();

    // Should not have logged anything during hot path
    expect(consoleDebugSpy).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  test('element resolution should not log by default', () => {
    // Simulate production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Create a test element
    const testEl = document.createElement('div');
    testEl.id = 'test-element';
    document.body.appendChild(testEl);

    const renderer = createDOMRenderer();
    consoleDebugSpy.mockClear();

    const components = {
      Render: { props: { opacity: 1 } },
    };

    // Call update with selector
    renderer.preFrame?.();
    renderer.update(1, '#test-element', components);
    renderer.postFrame?.();

    // Should not log element resolution by default
    expect(consoleDebugSpy).not.toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(testEl);
    process.env.NODE_ENV = originalEnv;
  });
});
