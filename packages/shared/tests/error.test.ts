import { describe, expect, test, vi } from 'vitest';
import { createWarn, isFatalError, panic, invariant } from '../src/error';

describe('error utilities', () => {
  test('panic throws fatal error with context', () => {
    try {
      panic('boom', { code: 'TEST' });
      throw new Error('panic did not throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('boom');
      expect(isFatalError(err)).toBe(true);
      expect((err as any).__motionContext).toEqual({ code: 'TEST' });
    }
  });

  test('invariant throws when condition is false', () => {
    expect(() => invariant(false, 'nope')).toThrow('nope');
  });

  test('createWarn logs only in development', () => {
    const originalEnv = process.env.NODE_ENV;
    const warn = createWarn('TestWarn');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    process.env.NODE_ENV = 'development';
    warn('hello', { a: 1 });
    expect(spy).toHaveBeenCalledWith('[Motion][TestWarn]', 'hello', { a: 1 });

    spy.mockClear();
    process.env.NODE_ENV = 'production';
    warn('nope');
    expect(spy).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
    spy.mockRestore();
  });
});
