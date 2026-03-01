import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DebugController,
  globalDebugController,
  createDebugger,
  debug,
  type DebugLevel,
  type DebugEnvironment,
} from '../src';
import { _clearDebuggerCache } from '@g-motion/test-utils';

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/** 创建一个 mock 环境，所有方法默认返回 undefined */
function createMockEnv(overrides: Partial<DebugEnvironment> = {}): DebugEnvironment {
  return {
    getGlobalLevel: () => undefined,
    getStorageFlag: () => undefined,
    getUrlFlag: () => undefined,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Part A: 实例级隔离 —— 依赖注入 mock 环境 (Layer 1 isolation)
// ═══════════════════════════════════════════════════════════════

describe('DebugController — isolated instances', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── threshold 解析 ─────────────────────────────────────────

  it('uses globalLevel when provided', () => {
    const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));
    expect(ctrl.getThreshold()).toBe('verbose');
    expect(ctrl.shouldLog('info')).toBe(true);
    expect(ctrl.shouldLog('verbose')).toBe(true);
  });

  it('falls back to urlFlag when globalLevel is undefined', () => {
    const ctrl = new DebugController(createMockEnv({ getUrlFlag: () => 'true' }));
    expect(ctrl.getThreshold()).toBe('verbose');
    expect(ctrl.shouldLog('error')).toBe(true);
    expect(ctrl.shouldLog('warn')).toBe(true);
  });

  it('falls back to storageFlag when globalLevel and urlFlag are undefined', () => {
    const ctrl = new DebugController(createMockEnv({ getStorageFlag: () => 'true' }));
    expect(ctrl.getThreshold()).toBe('verbose');
  });

  it('respects globalThis.__MOTION_DEBUG_LEVEL__', () => {
    const ctrl = new DebugController({
      getGlobalLevel: () => 'error',
    });
    expect(ctrl.getThreshold()).toBe('error');
  });

  it('defaults to verbose in non-production when all env returns undefined', () => {
    const ctrl = new DebugController(createMockEnv());
    // In test environment (not production), should default to verbose
    expect(ctrl.shouldLog('verbose')).toBe(true);
  });

  // ─── threshold 缓存行为 ────────────────────────────────────

  it('caches threshold — env callback invoked only once', () => {
    let callCount = 0;
    const ctrl = new DebugController(
      createMockEnv({
        getGlobalLevel: () => {
          callCount++;
          return 'warn';
        },
      }),
    );

    // 多次调用 shouldLog
    ctrl.shouldLog('info');
    ctrl.shouldLog('error');
    ctrl.shouldLog('warn');
    ctrl.shouldLog('verbose');

    expect(callCount).toBe(1); // env 只被查询了一次
  });

  it('invalidateThreshold() forces re-computation from env', () => {
    let level: DebugLevel = 'warn';
    let callCount = 0;
    const ctrl = new DebugController(
      createMockEnv({
        getGlobalLevel: () => {
          callCount++;
          return level;
        },
      }),
    );

    expect(ctrl.shouldLog('info')).toBe(false); // warn 级别下 info 不输出
    expect(callCount).toBe(1);

    // 动态切换级别
    level = 'verbose';
    ctrl.invalidateThreshold();

    expect(ctrl.shouldLog('info')).toBe(true); // 重新计算后 info 可输出
    expect(callCount).toBe(2); // 第二次查询了 env
  });

  // ─── createDebugger 缓存 ──────────────────────────────────

  it('createDebugger returns same reference for same namespace+level', () => {
    const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));
    const logA = ctrl.createDebugger('TestNS', 'info');
    const logB = ctrl.createDebugger('TestNS', 'info');
    expect(logA).toBe(logB); // 同一函数引用
  });

  it('createDebugger returns different reference for different level', () => {
    const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));
    const logInfo = ctrl.createDebugger('NS', 'info');
    const logWarn = ctrl.createDebugger('NS', 'warn');
    expect(logInfo).not.toBe(logWarn);
  });

  it('createDebugger output respects shouldLog', () => {
    const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => 'warn' }));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logInfo = ctrl.createDebugger('NS', 'info');
    const logWarn = ctrl.createDebugger('NS', 'warn');

    logInfo('should not appear');
    logWarn('should appear');

    expect(infoSpy).not.toHaveBeenCalled(); // info < warn threshold
    expect(warnSpy).toHaveBeenCalledWith('[Motion][NS]', 'should appear');

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('maps debug levels to correct console methods', () => {
    const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    ctrl.createDebugger('Test', 'error')('error msg');
    ctrl.createDebugger('Test', 'warn')('warn msg');
    ctrl.createDebugger('Test', 'info')('info msg');
    ctrl.createDebugger('Test', 'verbose')('verbose msg');

    expect(errorSpy).toHaveBeenCalledWith('[Motion][Test]', 'error msg');
    expect(warnSpy).toHaveBeenCalledWith('[Motion][Test]', 'warn msg');
    expect(infoSpy).toHaveBeenCalledWith('[Motion][Test]', 'info msg');
    expect(logSpy).toHaveBeenCalledWith('[Motion][Test]', 'verbose msg');

    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    logSpy.mockRestore();
  });

  // ─── reset ────────────────────────────────────────────────

  it('reset() clears logger cache — new createDebugger returns new reference', () => {
    const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));
    const logBefore = ctrl.createDebugger('NS', 'info');
    ctrl.reset();
    const logAfter = ctrl.createDebugger('NS', 'info');
    expect(logBefore).not.toBe(logAfter); // 新引用
  });

  it('reset() clears threshold cache — forces re-computation', () => {
    let callCount = 0;
    const ctrl = new DebugController(
      createMockEnv({
        getGlobalLevel: () => {
          callCount++;
          return 'warn';
        },
      }),
    );

    ctrl.shouldLog('info'); // 触发首次计算
    expect(callCount).toBe(1);

    ctrl.reset();
    ctrl.shouldLog('info'); // reset 后再次触发计算
    expect(callCount).toBe(2);
  });

  // ─── 实例间完全隔离 ────────────────────────────────────────

  it('two instances with different env are fully independent', () => {
    const ctrl1 = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));
    const ctrl2 = new DebugController(createMockEnv({ getGlobalLevel: () => 'none' }));

    expect(ctrl1.shouldLog('info')).toBe(true);
    expect(ctrl2.shouldLog('error')).toBe(false); // 'none' 级别什么都不输出
  });

  it('reset on one instance does not affect another', () => {
    const ctrl1 = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));
    const ctrl2 = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));

    const log1 = ctrl1.createDebugger('NS');
    const log2 = ctrl2.createDebugger('NS');

    ctrl1.reset();

    // ctrl1 的缓存被清除
    expect(ctrl1.createDebugger('NS')).not.toBe(log1);
    // ctrl2 的缓存不受影响
    expect(ctrl2.createDebugger('NS')).toBe(log2);
  });

  // ─── 构造函数不执行 env 回调 ────────────────────────────────

  it('constructor does not invoke any env methods (lazy evaluation)', () => {
    let called = false;
    const _ctrl = new DebugController(
      createMockEnv({
        getGlobalLevel: () => {
          called = true;
          return 'warn';
        },
        getStorageFlag: () => {
          called = true;
          return undefined;
        },
        getUrlFlag: () => {
          called = true;
          return undefined;
        },
      }),
    );

    expect(called).toBe(false); // 构造后没有任何 env 被调用
  });

  // ─── Backward Compatibility ────────────────────────────────

  it('backward compatibility: clear() method works', () => {
    const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => 'verbose' }));
    const logBefore = ctrl.createDebugger('Test');
    ctrl.clear();
    const logAfter = ctrl.createDebugger('Test');
    expect(logBefore).not.toBe(logAfter);
  });
});

// ═══════════════════════════════════════════════════════════════
// Part B: Level Ordering Boundary Tests
// ═══════════════════════════════════════════════════════════════

describe('DebugController — level ordering', () => {
  const levels: DebugLevel[] = ['none', 'error', 'warn', 'info', 'verbose'];

  levels.forEach((threshold) => {
    it(`threshold=${threshold}: only logs levels >= threshold`, () => {
      const ctrl = new DebugController(createMockEnv({ getGlobalLevel: () => threshold }));

      const expectedOrder: Record<DebugLevel, number> = {
        none: 0,
        error: 1,
        warn: 2,
        info: 3,
        verbose: 4,
      };

      levels.forEach((level) => {
        const shouldLog = expectedOrder[level] <= expectedOrder[threshold];
        expect(ctrl.shouldLog(level)).toBe(shouldLog);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Part C: Global Instance + Convenience Functions
// ═══════════════════════════════════════════════════════════════

describe('DebugController — global instance and convenience functions', () => {
  beforeEach(() => {
    _clearDebuggerCache(globalDebugController);
    vi.restoreAllMocks();
  });

  it('createDebugger convenience function works', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createDebugger('GlobalTest', 'verbose');
    logger('test message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('default debug export works', () => {
    expect(typeof debug).toBe('function');
  });

  it('global instance can be reset', () => {
    const logBefore = globalDebugController.createDebugger('ResetTest');
    _clearDebuggerCache(globalDebugController);
    const logAfter = globalDebugController.createDebugger('ResetTest');
    expect(logBefore).not.toBe(logAfter);
  });
});

// ═══════════════════════════════════════════════════════════════
// Part D: Environment Detection Tests
// ═══════════════════════════════════════════════════════════════

describe('DebugController — environment detection', () => {
  it('respects URL motion_debug flag', () => {
    const ctrl = new DebugController({
      getGlobalLevel: () => undefined,
      getUrlFlag: () => 'true',
    });
    expect(ctrl.getThreshold()).toBe('verbose');
  });

  it('respects localStorage motion_debug flag', () => {
    const ctrl = new DebugController({
      getGlobalLevel: () => undefined,
      getStorageFlag: () => 'true',
    });
    expect(ctrl.getThreshold()).toBe('verbose');
  });

  it('globalLevel takes priority over URL and storage flags', () => {
    const ctrl = new DebugController({
      getGlobalLevel: () => 'error',
      getUrlFlag: () => 'true',
      getStorageFlag: () => 'true',
    });
    expect(ctrl.getThreshold()).toBe('error');
  });
});

// ═══════════════════════════════════════════════════════════════
// Part E: Cross-Isolation Verification
// ═══════════════════════════════════════════════════════════════

describe('DebugController — cross-isolation verification', () => {
  it('independent instance does not share threshold with global', () => {
    // Reset global first
    _clearDebuggerCache(globalDebugController);

    // Create isolated instance with different config
    const isolated = new DebugController({
      getGlobalLevel: () => 'none',
    });

    // Global instance uses default (verbose in test env)
    expect(globalDebugController.shouldLog('info')).toBe(true);
    // Isolated instance is configured to none
    expect(isolated.shouldLog('info')).toBe(false);
  });

  it('global instance reset does not affect isolated instances', () => {
    const isolated = new DebugController({
      getGlobalLevel: () => 'verbose',
    });

    const isolatedLog = isolated.createDebugger('IsolatedTest');

    // Reset global
    _clearDebuggerCache(globalDebugController);

    // Isolated instance cache unchanged
    expect(isolated.createDebugger('IsolatedTest')).toBe(isolatedLog);
  });
});
