import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EasingRegistry,
  globalEasingRegistry,
  getEasingId,
  registerGpuEasing,
  getCustomEasingVersion,
} from '../src';
import { __resetCustomEasings } from '@g-motion/test-utils';

// ═══════════════════════════════════════════════════════════════
// Part A: 实例级隔离 —— 每个 test 创建独立实例 (Layer 1 isolation)
// ═══════════════════════════════════════════════════════════════

describe('EasingRegistry — isolated instances', () => {
  /**
   * 工厂函数：每次返回全新实例。
   * 所有可变状态（_customEasings, _nextId, _version, _loggedUnknown）
   * 都是实例属性，不同实例之间零共享。
   */
  function createRegistry(startId = 100) {
    return new EasingRegistry(startId);
  }

  // ─── 内置 easing 查找 ───────────────────────────────────────

  it('returns correct id for builtin easings', () => {
    const reg = createRegistry();
    expect(reg.getId('linear')).toBe(0);
    expect(reg.getId('easeInQuad')).toBe(1);
    expect(reg.getId('easeOutQuad')).toBe(2);
    expect(reg.getId('easeInOutQuad')).toBe(3);
    expect(reg.getId('easeInCubic')).toBe(4);
    expect(reg.getId('easeOutCubic')).toBe(5);
    expect(reg.getId('easeInOutCubic')).toBe(6);
    expect(reg.getId('easeInQuart')).toBe(7);
    expect(reg.getId('easeOutQuart')).toBe(8);
    expect(reg.getId('easeInOutQuart')).toBe(9);
    expect(reg.getId('easeInQuint')).toBe(10);
    expect(reg.getId('easeOutQuint')).toBe(11);
    expect(reg.getId('easeInOutQuint')).toBe(12);
    expect(reg.getId('easeInSine')).toBe(13);
    expect(reg.getId('easeOutSine')).toBe(14);
    expect(reg.getId('easeInOutSine')).toBe(15);
    expect(reg.getId('easeInExpo')).toBe(16);
    expect(reg.getId('easeOutExpo')).toBe(17);
    expect(reg.getId('easeInOutExpo')).toBe(18);
    expect(reg.getId('easeInCirc')).toBe(19);
    expect(reg.getId('easeOutCirc')).toBe(20);
    expect(reg.getId('easeInOutCirc')).toBe(21);
    expect(reg.getId('easeInBack')).toBe(22);
    expect(reg.getId('easeOutBack')).toBe(23);
    expect(reg.getId('easeInOutBack')).toBe(24);
    expect(reg.getId('easeInElastic')).toBe(25);
    expect(reg.getId('easeOutElastic')).toBe(26);
    expect(reg.getId('easeInOutElastic')).toBe(27);
    expect(reg.getId('easeInBounce')).toBe(28);
    expect(reg.getId('easeOutBounce')).toBe(29);
    expect(reg.getId('easeInOutBounce')).toBe(30);
  });

  // ─── 别名解析 ──────────────────────────────────────────────

  it('resolves kebab-case aliases to camelCase builtins', () => {
    const reg = createRegistry();
    expect(reg.getId('easeIn')).toBe(reg.getId('easeInQuad'));
    expect(reg.getId('easeOut')).toBe(reg.getId('easeOutQuad'));
    expect(reg.getId('easeInOut')).toBe(reg.getId('easeInOutQuad'));
    expect(reg.getId('ease-in')).toBe(reg.getId('easeInQuad'));
    expect(reg.getId('ease-out')).toBe(reg.getId('easeOutQuad'));
    expect(reg.getId('ease-in-out')).toBe(reg.getId('easeInOutQuad'));
  });

  // ─── 自定义 easing 注册 ────────────────────────────────────

  it('registers custom easing with incremental id', () => {
    const reg = createRegistry();
    const e1 = reg.register('customA', 'fn customA(t: f32) -> f32 { return t; }');
    const e2 = reg.register('customB', 'fn customB(t: f32) -> f32 { return t * t; }');
    expect(e1.id).toBe(100);
    expect(e2.id).toBe(101);
    expect(e1.name).toBe('customA');
    expect(e1.wgslFn).toBe('fn customA(t: f32) -> f32 { return t; }');
    expect(e2.wgslFn).toBe('fn customB(t: f32) -> f32 { return t * t; }');
  });

  // ─── 幂等性 ────────────────────────────────────────────────

  it('register is idempotent — same name returns same entry, version increments once', () => {
    const reg = createRegistry();
    const e1 = reg.register('x', 'fn x(t: f32) -> f32 { return t; }');
    const e2 = reg.register('x', 'fn x(t: f32) -> f32 { return t; }');
    expect(e1).toBe(e2); // 同一对象引用
    expect(reg.version).toBe(1); // 只增了一次
    expect(reg.customCount).toBe(1); // 只有一条
  });

  // ─── 未知 easing 回退 ──────────────────────────────────────

  it('falls back unknown easing to linear (id=0) with console.warn', () => {
    const reg = createRegistry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const id = reg.getId('nonexistent');
    expect(id).toBe(0); // linear

    // 验证警告输出
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));

    // 验证去重：第二次查询不再警告
    reg.getId('nonexistent');
    expect(warnSpy).toHaveBeenCalledOnce(); // 仍然是 1 次

    warnSpy.mockRestore();
  });

  // ─── WGSL 函数名提取 ──────────────────────────────────────

  it('extracts wgsl function name from code', () => {
    const reg = createRegistry();
    const entry = reg.register(
      'myEase',
      `
      fn myEase(t: f32) -> f32 {
        return t * t * (3.0 - 2.0 * t);
      }
    `,
    );
    expect(entry.name).toBe('myEase');
  });

  it('handles wgsl code without valid fn declaration', () => {
    const reg = createRegistry();
    // Should throw error for invalid WGSL
    expect(() => reg.register('broken', 'invalid wgsl code')).toThrow();
  });

  // ─── getEntry ──────────────────────────────────────────────

  it('getEntry returns entry for registered easing, undefined for unknown', () => {
    const reg = createRegistry();
    reg.register('test', 'fn test(t: f32) -> f32 { return t; }');
    expect(reg.getEntry('test')).toBeDefined();
    expect(reg.getEntry('test')!.id).toBe(100);
    expect(reg.getEntry('unknown')).toBeUndefined();
  });

  it('getEntry returns correct entry for builtins and aliases', () => {
    const reg = createRegistry();
    expect(reg.getEntry('linear')).toEqual({ id: 0, name: 'linear' });
    expect(reg.getEntry('easeIn')).toEqual({ id: 1, name: 'easeInQuad' });
  });

  // ─── reset vs hardReset ────────────────────────────────────

  it('reset() clears custom easings and version but preserves _nextId', () => {
    const reg = createRegistry();
    reg.register('a', 'fn a(t: f32) -> f32 { return t; }'); // id=100
    expect(reg.customCount).toBe(1);
    expect(reg.version).toBe(1);

    reg.reset();
    expect(reg.customCount).toBe(0);
    expect(reg.version).toBe(0);
    expect(reg.getId('a')).toBe(0); // 已清除，fallback

    // 关键断言：reset 后新注册的 easing 从 101 开始（不是 100）
    const e = reg.register('b', 'fn b(t: f32) -> f32 { return t; }');
    expect(e.id).toBe(101);
  });

  it('hardReset() also resets _nextId to specified startId', () => {
    const reg = createRegistry();
    reg.register('a', 'fn a(t: f32) -> f32 { return t; }'); // id=100
    reg.hardReset(100);

    const e = reg.register('b', 'fn b(t: f32) -> f32 { return t; }');
    expect(e.id).toBe(100); // ID 被重置
  });

  it('reset() also clears warning deduplication', () => {
    const reg = createRegistry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    reg.getId('unknown1'); // 触发警告
    expect(warnSpy).toHaveBeenCalledOnce();

    reg.reset();
    reg.getId('unknown1'); // reset 后同一名称应再次触发警告
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  // ─── getCustomGpuEasings ───────────────────────────────────

  it('getCustomGpuEasings returns array of custom easings', () => {
    const reg = createRegistry();
    reg.register('custom1', 'fn custom1(t: f32) -> f32 { return t; }');
    reg.register('custom2', 'fn custom2(t: f32) -> f32 { return t * t; }');

    const customs = reg.getCustomGpuEasings();
    expect(customs).toHaveLength(2);
    expect(customs[0].name).toBe('custom1');
    expect(customs[0].id).toBe(100);
    expect(customs[1].name).toBe('custom2');
    expect(customs[1].id).toBe(101);
  });

  // ─── 实例间完全隔离 ────────────────────────────────────────

  it('two instances are fully isolated — mutations in one do not affect the other', () => {
    const reg1 = createRegistry();
    const reg2 = createRegistry();

    reg1.register('onlyInReg1', 'fn onlyInReg1(t: f32) -> f32 { return t; }');

    expect(reg1.getId('onlyInReg1')).toBe(100); // 存在
    expect(reg1.customCount).toBe(1);

    // reg2 完全看不到 reg1 的注册
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(reg2.getId('onlyInReg1')).toBe(0); // fallback to linear
    expect(reg2.customCount).toBe(0);
    warnSpy.mockRestore();
  });

  it('reset on one instance does not affect another', () => {
    const reg1 = createRegistry();
    const reg2 = createRegistry();

    reg1.register('a', 'fn a(t: f32) -> f32 { return t; }');
    reg2.register('b', 'fn b(t: f32) -> f32 { return t; }');

    reg1.reset();
    expect(reg1.customCount).toBe(0); // reg1 已清
    expect(reg2.customCount).toBe(1); // reg2 不受影响
    expect(reg2.getId('b')).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// Part B: 用例级隔离 —— 全局实例 + beforeEach reset (Layer 2 isolation)
// ═══════════════════════════════════════════════════════════════

describe('EasingRegistry — global convenience functions', () => {
  /**
   * 为什么需要 beforeEach：
   * 同一个 describe 块内所有 it() 共享同一份 ES 模块缓存。
   * globalEasingRegistry 是模块级单例，test A 的修改会泄漏到 test B。
   * beforeEach + reset() 确保每个 test 看到干净的全局状态。
   */
  beforeEach(() => {
    __resetCustomEasings(globalEasingRegistry);
  });

  it('convenience functions proxy to global instance', () => {
    registerGpuEasing('test', 'fn test(t: f32) -> f32 { return t; }');
    expect(getEasingId('test')).toBeGreaterThan(0);
    expect(getCustomEasingVersion()).toBe(1);
  });

  it('global state is clean after reset (no leak from previous test)', () => {
    // 如果上一个 test 的 'test' easing 泄漏了，这里会失败
    expect(globalEasingRegistry.customCount).toBe(0);
    expect(getEasingId('test')).toBe(0); // fallback to linear
    expect(getCustomEasingVersion()).toBe(0);
  });

  it('multiple registrations in one test do not affect next test', () => {
    registerGpuEasing('a', 'fn a(t: f32) -> f32 { return t; }');
    registerGpuEasing('b', 'fn b(t: f32) -> f32 { return t; }');
    registerGpuEasing('c', 'fn c(t: f32) -> f32 { return t; }');
    expect(globalEasingRegistry.customCount).toBe(3);
    // beforeEach 会在下一个 test 前清理
  });

  it('confirms previous test registrations were cleaned', () => {
    expect(globalEasingRegistry.customCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Part C: 跨隔离层验证 (Layer 3 cross-isolation)
// ═══════════════════════════════════════════════════════════════

describe('EasingRegistry — cross-isolation verification', () => {
  beforeEach(() => {
    __resetCustomEasings(globalEasingRegistry);
  });

  it('independent instance does not see global instance state', () => {
    // 先在全局注册
    registerGpuEasing('globalOnly', 'fn globalOnly(t: f32) -> f32 { return t; }');

    // 独立实例看不到
    const isolated = new EasingRegistry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isolated.getId('globalOnly')).toBe(0);
    warnSpy.mockRestore();
  });

  it('global instance does not see independent instance state', () => {
    const isolated = new EasingRegistry();
    isolated.register('isolatedOnly', 'fn isolatedOnly(t: f32) -> f32 { return t; }');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getEasingId('isolatedOnly')).toBe(0);
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// Backward Compatibility Tests
// ═══════════════════════════════════════════════════════════════

describe('EasingRegistry — backward compatibility', () => {
  beforeEach(() => {
    __resetCustomEasings(globalEasingRegistry);
  });

  it('backward compatibility: getEasingId method', () => {
    expect(globalEasingRegistry.getEasingId('linear')).toBe(0);
    expect(globalEasingRegistry.getEasingId('easeInQuad')).toBe(1);
  });

  it('backward compatibility: registerGpuEasing method extracts name from code', () => {
    const name = globalEasingRegistry.registerGpuEasing(
      'fn legacyEasing(t: f32) -> f32 { return t; }',
    );
    expect(name).toBe('legacyEasing');
    expect(globalEasingRegistry.getId('legacyEasing')).toBeGreaterThan(0);
  });

  it('backward compatibility: getCustomEasingVersion method', () => {
    expect(globalEasingRegistry.getCustomEasingVersion()).toBe(0);
    globalEasingRegistry.register('vtest', 'fn vtest(t: f32) -> f32 { return t; }');
    expect(globalEasingRegistry.getCustomEasingVersion()).toBe(1);
  });

  it('backward compatibility: clear method', () => {
    globalEasingRegistry.register('clearTest', 'fn clearTest(t: f32) -> f32 { return t; }');
    expect(globalEasingRegistry.customCount).toBe(1);
    globalEasingRegistry.clear();
    expect(globalEasingRegistry.customCount).toBe(0);
  });

  it('legacy API: registerGpuEasing with single argument (wgsl only)', () => {
    const wgsl = 'fn extractedName(t: f32) -> f32 { return t; }';
    const name = registerGpuEasing(wgsl);
    expect(name).toBe('extractedName');
    expect(getEasingId('extractedName')).toBeGreaterThan(0);
  });
});
