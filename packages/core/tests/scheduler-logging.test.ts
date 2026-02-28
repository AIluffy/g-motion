/**
 * Test suite for logging behavior in SystemScheduler
 * Verifies that errors are logged appropriately without flooding console
 */
import {
  AsyncReadbackManager,
  drainGPUResults,
  enqueueGPUResults,
  setPendingReadbackCount,
} from '@g-motion/webgpu';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { panic } from '@g-motion/shared';
import { AppContext } from '../src/context';
import { SystemDef } from '../src/plugin';
import { SystemScheduler } from '../src/scheduler';
import { World } from '../src/world';
import { WorldProvider } from '../src/worldProvider';

describe('SystemScheduler Logging', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let world: World;

  beforeEach(() => {
    AppContext.reset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Create a world for testing
    world = new World();
    WorldProvider.withWorld(world, () => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    AppContext.reset();
  });

  test('should not flood console during normal operation', () => {
    // Simulate production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const scheduler = new SystemScheduler();
    scheduler.setServices({
      world,
      scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor: AppContext.getInstance().getBatchProcessor(),
      metrics: {} as any,
      appContext: AppContext.getInstance(),
    });
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

  test('should log system errors in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const scheduler = new SystemScheduler();
    scheduler.setServices({
      world,
      scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor: AppContext.getInstance().getBatchProcessor(),
      metrics: {} as any,
      appContext: AppContext.getInstance(),
    });
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

        // Should have logged the error in development
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Motion][SchedulerProcessor]'),
          expect.stringContaining("System 'ErrorSystem' update failed"),
          expect.objectContaining({ systemName: 'ErrorSystem' }),
        );

        process.env.NODE_ENV = originalEnv;
        resolve();
      }, 50);
    });
  });

  test('should not log errors in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const scheduler = new SystemScheduler();
    scheduler.setServices({
      world,
      scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor: AppContext.getInstance().getBatchProcessor(),
      metrics: {} as any,
      appContext: AppContext.getInstance(),
    });
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

        // Should not log in production
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
        resolve();
      }, 50);
    });
  });

  test('should continue processing after system errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const scheduler = new SystemScheduler();
    scheduler.setServices({
      world,
      scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor: AppContext.getInstance().getBatchProcessor(),
      metrics: {} as any,
      appContext: AppContext.getInstance(),
    });
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

  test('should stop scheduler on fatal errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const originalQueueMicrotask = globalThis.queueMicrotask;
    const queuedErrors: unknown[] = [];
    globalThis.queueMicrotask = (cb: () => void) => {
      try {
        cb();
      } catch (err) {
        queuedErrors.push(err);
      }
    };

    const scheduler = new SystemScheduler();
    scheduler.setServices({
      world,
      scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor: AppContext.getInstance().getBatchProcessor(),
      metrics: {} as any,
      appContext: AppContext.getInstance(),
    });

    const fatalSystem: SystemDef = {
      name: 'FatalSystem',
      order: 1,
      update: () => {
        panic('Fatal error in system', { systemName: 'FatalSystem' });
      },
    };

    scheduler.add(fatalSystem);
    scheduler.start();
    scheduler.setActiveEntityCount(1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scheduler.stop();
        expect(scheduler.isRunning).toBe(false);
        expect(queuedErrors.length).toBeGreaterThan(0);
        expect(queuedErrors[0]).toBeInstanceOf(Error);
        expect((queuedErrors[0] as Error).message).toContain('Fatal error in system');

        globalThis.queueMicrotask = originalQueueMicrotask;
        process.env.NODE_ENV = originalEnv;
        resolve();
      }, 50);
    });
  });

  test('should keep running to apply late GPU results after finishing', () => {
    const scheduler = new SystemScheduler();
    scheduler.setServices({
      world,
      scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor: AppContext.getInstance().getBatchProcessor(),
      metrics: {} as any,
      appContext: AppContext.getInstance(),
    });

    let zeroed = false;
    let updatesAfterZero = 0;
    let applied = false;

    const endSystem: SystemDef = {
      name: 'EndSystem',
      order: 1,
      update: () => {
        if (!zeroed) {
          zeroed = true;
          scheduler.setActiveEntityCount(0);
          setPendingReadbackCount(1);
          return;
        }
        updatesAfterZero++;
      },
    };

    const drainSystem: SystemDef = {
      name: 'DrainSystem',
      order: 2,
      update: () => {
        const packets = drainGPUResults();
        if (packets.length) {
          applied = true;
        }
      },
    };

    scheduler.add(endSystem);
    scheduler.add(drainSystem);

    scheduler.start();
    scheduler.setActiveEntityCount(1);

    setTimeout(() => {
      enqueueGPUResults({
        archetypeId: 'test',
        entityIds: new Int32Array([1]),
        values: new Float32Array([123]),
      });
      setPendingReadbackCount(0);
    }, 20);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scheduler.stop();
        setPendingReadbackCount(0);

        expect(updatesAfterZero).toBeGreaterThan(0);
        expect(applied).toBe(true);

        resolve();
      }, 120);
    });
  });

  test('should drain timed-out readbacks once settled', async () => {
    const manager = new AsyncReadbackManager();

    let now = 0;
    const perfNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);

    const mapped = new Float32Array([42]).buffer;
    let unmapped = false;
    const buffer = {
      getMappedRange() {
        return mapped;
      },
      unmap() {
        unmapped = true;
      },
    } as any;

    manager.enqueueMapAsync('a', [1], buffer, Promise.resolve(), 4, 50);

    await Promise.resolve();
    await Promise.resolve();

    now = 1000;
    const results = await manager.drainCompleted(10);

    expect(results).toHaveLength(1);
    expect(results[0].values?.[0]).toBe(42);
    expect(results[0].expired).toBe(true);
    expect(unmapped).toBe(true);
    expect(manager.getPendingCount()).toBe(0);

    perfNowSpy.mockRestore();
  });

  test('should release readback resources on completion', async () => {
    const manager = new AsyncReadbackManager();
    let releaseCount = 0;
    const mapped = new Float32Array([7]).buffer;
    const buffer = {
      getMappedRange() {
        return mapped;
      },
      unmap() {},
    } as any;
    const release = () => {
      releaseCount += 1;
    };

    const mapPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    manager.enqueueMapAsync(
      'a',
      [1],
      buffer,
      mapPromise,
      4,
      50,
      1,
      undefined,
      undefined,
      undefined,
      release,
    );

    await mapPromise;
    await Promise.resolve();

    const results = await manager.drainCompleted(10);
    expect(releaseCount).toBe(1);
    expect((results[0] as { released?: boolean }).released).toBe(true);
  });

  test('should carry decoded tag metadata for culling-style readbacks', async () => {
    const manager = new AsyncReadbackManager();

    let latestFrame = 1;
    const mapped = new ArrayBuffer(12);
    const u32 = new Uint32Array(mapped);
    u32[0] = 2;
    u32[1] = 10;
    u32[2] = 20;

    let unmapped = false;
    const buffer = {
      getMappedRange() {
        return mapped;
      },
      unmap() {
        unmapped = true;
      },
      destroy() {},
    } as any;

    manager.enqueueMapAsyncDecoded(
      'a',
      buffer,
      Promise.resolve(),
      12,
      (range: ArrayBuffer, entry: any) => {
        const view = new Uint32Array(range);
        const visibleCount = view[0] >>> 0;
        return {
          entityIds: new Int32Array(Array.from(view.subarray(1, 1 + visibleCount))),
          tag: {
            ...entry.tag,
            visibleCount,
            stale: latestFrame !== entry.tag.frameId,
          },
        };
      },
      50,
      { kind: 'culling', frameId: 1 },
    );

    await Promise.resolve();
    await Promise.resolve();

    latestFrame = 2;
    const results = await manager.drainCompleted(10);

    expect(results).toHaveLength(1);
    expect((results[0].tag as any).kind).toBe('culling');
    expect((results[0].tag as any).stale).toBe(true);
    expect(unmapped).toBe(true);
  });

  test('should unmap pending readbacks on clear', () => {
    const manager = new AsyncReadbackManager();
    let unmapped = false;
    const buffer = {
      unmap() {
        unmapped = true;
      },
    } as any;
    const mapPromise = new Promise<void>(() => undefined);

    manager.enqueueMapAsync('a', [1], buffer, mapPromise, 4, 50);
    manager.clear();

    expect(unmapped).toBe(true);
    expect(manager.getPendingCount()).toBe(0);
  });

  test('should release readback resources on clear', () => {
    const manager = new AsyncReadbackManager();
    let releaseCount = 0;
    const buffer = {
      unmap: vi.fn(),
    } as any;
    const mapPromise = new Promise<void>(() => undefined);
    const release = () => {
      releaseCount += 1;
    };

    for (let i = 0; i < 32; i++) {
      manager.enqueueMapAsyncDecoded(
        'a',
        buffer,
        mapPromise,
        4,
        () => null,
        50,
        { kind: 'c' },
        release,
      );
    }

    manager.clear();

    expect(releaseCount).toBe(32);
    expect(manager.getPendingCount()).toBe(0);
  });
});
