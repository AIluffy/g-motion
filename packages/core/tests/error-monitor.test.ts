import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { AppContext, getErrorMonitor } from '../src/context';
import { ErrorHandler } from '../../shared/src/error/error-handler';
import {
  ErrorCode,
  ErrorMonitor,
  ErrorSeverity,
  type ErrorAggregate,
} from '../../shared/src/error';

describe('ErrorMonitor', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    AppContext.reset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('records events via ErrorHandler.handle', () => {
    const handler = AppContext.getInstance().getErrorHandler();
    const monitor = getErrorMonitor();

    expect(monitor.getEvents()).toHaveLength(0);

    handler.create('GPU init failed', ErrorCode.GPU_INIT_FAILED, ErrorSeverity.ERROR, {
      stage: 'init',
    });

    const events = monitor.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        scope: 'gpu',
        code: ErrorCode.GPU_INIT_FAILED,
        severity: ErrorSeverity.ERROR,
        message: expect.stringContaining('[GPU_INIT_FAILED]'),
        context: expect.objectContaining({ stage: 'init' }),
      }),
    );
  });

  test('aggregates by scope, code, and severity', () => {
    const handler = AppContext.getInstance().getErrorHandler();
    const monitor = getErrorMonitor();

    handler.create('Batch not found', ErrorCode.BATCH_NOT_FOUND, ErrorSeverity.WARNING, {
      batchId: 'a',
    });
    handler.create('Batch not found', ErrorCode.BATCH_NOT_FOUND, ErrorSeverity.WARNING, {
      batchId: 'b',
    });
    handler.create('System update failed', ErrorCode.SYSTEM_UPDATE_FAILED, ErrorSeverity.WARNING);

    const aggregates = monitor.getAggregates();
    const batchAgg = aggregates.find(
      (aggregate: ErrorAggregate) =>
        aggregate.code === ErrorCode.BATCH_NOT_FOUND &&
        aggregate.severity === ErrorSeverity.WARNING,
    );
    expect(batchAgg).toEqual(
      expect.objectContaining({
        scope: 'batch',
        code: ErrorCode.BATCH_NOT_FOUND,
        severity: ErrorSeverity.WARNING,
        count: 2,
      }),
    );
  });

  test('supports dependency injection without AppContext', () => {
    const monitor = new ErrorMonitor();
    const handler = new ErrorHandler({
      recordError: (error) => monitor.record(error),
      logError: () => {},
    });

    handler.create('GPU init failed', ErrorCode.GPU_INIT_FAILED, ErrorSeverity.ERROR);

    const events = monitor.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        code: ErrorCode.GPU_INIT_FAILED,
        severity: ErrorSeverity.ERROR,
      }),
    );
  });
});
