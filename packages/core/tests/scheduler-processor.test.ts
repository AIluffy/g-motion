import { describe, it, expect, vi } from 'vitest';
import { SchedulerProcessor } from '../src/scheduler-processor';
import { ErrorCode, ErrorSeverity, MotionError } from '../src/errors';

describe('SchedulerProcessor', () => {
  it('reports system update errors via ErrorHandler', () => {
    const processor = new SchedulerProcessor();
    const handle = vi.fn();

    processor.processFrame({
      dtMs: 16,
      services: {
        config: {},
        metrics: {},
        errorHandler: { handle },
      } as any,
      systems: [
        {
          name: 'FailingSystem',
          update: () => {
            throw new Error('boom');
          },
        } as any,
      ],
      getWorld: () => null,
    });

    expect(handle).toHaveBeenCalledTimes(1);
    const error = handle.mock.calls[0]?.[0] as MotionError;
    expect(error).toBeInstanceOf(MotionError);
    expect(error.code).toBe(ErrorCode.SYSTEM_UPDATE_FAILED);
    expect(error.severity).toBe(ErrorSeverity.WARNING);
    expect(error.context?.systemName).toBe('FailingSystem');
  });

  it('does not throw if metrics.updateStatus throws', () => {
    const processor = new SchedulerProcessor();

    expect(() => {
      processor.processFrame({
        dtMs: 16,
        services: {
          config: {},
          metrics: {
            updateStatus: () => {
              throw new Error('metrics down');
            },
          },
          errorHandler: { handle: vi.fn() },
        } as any,
        systems: [{ name: 'OkSystem', update: () => {} } as any],
        getWorld: () => null,
      });
    }).not.toThrow();
  });
});
