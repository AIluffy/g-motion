import { expect, test, vi, beforeEach } from 'vitest';
import { createDebugger, _clearDebuggerCache } from '../src/index';

beforeEach(() => {
  // Clear caches before each test to ensure isolation
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

  // Force-enable via global flag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__MOTION_DEBUG__ = true;
  // Clear cache to pick up the new flag
  _clearDebuggerCache();
  logger('should-log');
  expect(spy).toHaveBeenCalledWith('[Motion][ProdTest]', 'should-log');

  // Cleanup
  delete (globalThis as any).__MOTION_DEBUG__;
  process.env.NODE_ENV = originalEnv;
  spy.mockRestore();
});
