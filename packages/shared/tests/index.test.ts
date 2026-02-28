import { expect, test, vi, beforeEach } from 'vitest';
import { createDebugger, _clearDebuggerCache } from '../src';

beforeEach(() => {
  _clearDebuggerCache();
});

test('logs in non-production by default', () => {
  const logger = createDebugger('Test');
  const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  logger('hello', 42);
  expect(spy).toHaveBeenCalledWith('[Motion][Test]', 'hello', 42);
  spy.mockRestore();
});

test('does not log in production unless __MOTION_DEBUG__ is set', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const logger = createDebugger('ProdTest');
  const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  logger('should-not-log');
  expect(spy).not.toHaveBeenCalled();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__MOTION_DEBUG__ = true;
  _clearDebuggerCache();
  logger('should-log');
  expect(spy).toHaveBeenCalledWith('[Motion][ProdTest]', 'should-log');

  delete (globalThis as any).__MOTION_DEBUG__;
  process.env.NODE_ENV = originalEnv;
  spy.mockRestore();
});
