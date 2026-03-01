import { describe, expect, test, vi } from 'vitest';
import { createDebugger } from '../src';
import { isFatalError, panic, invariant } from '../src/error';

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

  test('createDebugger works with warn level', () => {
    const warn = createDebugger('TestWarn', 'warn');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warn('hello', { a: 1 });
    // In dev mode by default, so it should log
    expect(spy).toHaveBeenCalledWith('[Motion][TestWarn]', 'hello', { a: 1 });

    spy.mockRestore();
  });
});
