import { expect, test, vi, beforeEach } from 'vitest';
import { createDebugger, DebugController } from '../src/debug';

beforeEach(() => {
  new DebugController().clear();
});

test('logs in non-production by default', () => {
  const logger = createDebugger('Test');
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  logger('hello', 42);
  expect(spy).toHaveBeenCalledWith('[Motion][Test]', 'hello', 42);
  spy.mockRestore();
});

test('does not log in production unless __MOTION_DEBUG__ is set', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  // Create a fresh DebugController instance for production test
  const prodDebugManager = new DebugController();
  const logger = prodDebugManager.createDebugger('ProdTest');
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  logger('should-not-log');
  expect(spy).not.toHaveBeenCalled();

  // Enable debug via environment injection
  const ctrlWithDebug = new DebugController({
    getGlobalLevel: () => 'verbose',
  });
  const debugLogger = ctrlWithDebug.createDebugger('ProdTest2');
  debugLogger('should-log');
  expect(spy).toHaveBeenCalledWith('[Motion][ProdTest2]', 'should-log');

  process.env.NODE_ENV = originalEnv;
  spy.mockRestore();
});
