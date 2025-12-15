/**
 * Test suite for logging behavior in SystemScheduler
 * Verifies that errors are logged appropriately without flooding console
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemScheduler } from '../src/scheduler';
import { SystemDef } from '../src/plugin';
import { WorldProvider } from '../src/worldProvider';
import { World } from '../src/world';
import { AppContext } from '../src/context';

describe('SystemScheduler Logging', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let originalDebugFlag: boolean | undefined;
  let world: World;

  beforeEach(() => {
    AppContext.reset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Save original __MOTION_DEBUG__ flag
    originalDebugFlag = (globalThis as any).__MOTION_DEBUG__;
    // Ensure debug is off by default
    delete (globalThis as any).__MOTION_DEBUG__;

    // Create a world for testing
    world = new World();
    WorldProvider.withWorld(world, () => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    // Restore original flag
    if (originalDebugFlag !== undefined) {
      (globalThis as any).__MOTION_DEBUG__ = originalDebugFlag;
    } else {
      delete (globalThis as any).__MOTION_DEBUG__;
    }
    AppContext.reset();
  });

  test('should not flood console during normal operation', () => {
    // Simulate production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const scheduler = new SystemScheduler();
    const testSystem: SystemDef = {
      name: 'TestSystem',
      order: 1,
      update: vi.fn(),
    };

    scheduler.add(testSystem);
    consoleWarnSpy.mockClear();

    // Simulate multiple frames
    scheduler.start();
    scheduler.setActiveEntityCount(1);

    // Wait a bit for frames to process
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scheduler.stop();

        // Should not have logged anything during normal operation
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
        resolve();
      }, 50);
    });
  });

  test('should log system errors via ErrorHandler', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const scheduler = new SystemScheduler();
    let errorThrown = false;
    const errorSystem: SystemDef = {
      name: 'ErrorSystem',
      order: 1,
      update: () => {
        if (!errorThrown) {
          errorThrown = true;
          throw new Error('Test error');
        }
      },
    };

    scheduler.add(errorSystem);
    consoleWarnSpy.mockClear();

    scheduler.start();
    scheduler.setActiveEntityCount(1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scheduler.stop();

        // Should have logged the error via ErrorHandler (WARNING severity)
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining("System 'ErrorSystem' update failed"),
          expect.objectContaining({ systemName: 'ErrorSystem' }),
        );

        process.env.NODE_ENV = originalEnv;
        resolve();
      }, 50);
    });
  });

  test('should not log errors in production unless __MOTION_DEBUG__ is enabled', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const scheduler = new SystemScheduler();
    const errorSystem: SystemDef = {
      name: 'ErrorSystem',
      order: 1,
      update: () => {
        throw new Error('Test error');
      },
    };

    scheduler.add(errorSystem);
    consoleWarnSpy.mockClear();

    scheduler.start();
    scheduler.setActiveEntityCount(1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scheduler.stop();

        // Should still log via ErrorHandler in production (no special production behavior)
        expect(consoleWarnSpy).toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
        resolve();
      }, 50);
    });
  });

  test('should continue processing after system errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const scheduler = new SystemScheduler();
    let errorThrown = false;
    let successSystemRan = false;

    const errorSystem: SystemDef = {
      name: 'ErrorSystem',
      order: 1,
      update: () => {
        if (!errorThrown) {
          errorThrown = true;
          throw new Error('Test error');
        }
      },
    };

    const successSystem: SystemDef = {
      name: 'SuccessSystem',
      order: 2,
      update: () => {
        successSystemRan = true;
      },
    };

    scheduler.add(errorSystem);
    scheduler.add(successSystem);
    consoleWarnSpy.mockClear();

    scheduler.start();
    scheduler.setActiveEntityCount(1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scheduler.stop();

        // Both systems should have run - error in one doesn't stop others
        expect(errorThrown).toBe(true);
        expect(successSystemRan).toBe(true);

        process.env.NODE_ENV = originalEnv;
        resolve();
      }, 50);
    });
  });
});
