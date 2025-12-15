import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorHandler } from '../src/error-handler';
import { AppContext } from '../src/context';
import { ErrorCode, ErrorSeverity, MotionError } from '../src/errors';

describe('ErrorHandler', () => {
  let context: AppContext;
  let handler: ErrorHandler;

  beforeEach(() => {
    AppContext.reset();
    context = AppContext.getInstance();
    handler = new ErrorHandler(context);
    vi.clearAllMocks();
  });

  describe('Error Creation', () => {
    it('should create MotionError with all properties', () => {
      const error = new MotionError(
        'Test error',
        ErrorCode.INVALID_PARAMETER,
        ErrorSeverity.FATAL,
        { value: 42 },
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MotionError);
      expect(error.message).toBe('[INVALID_PARAMETER] Test error');
      expect(error.code).toBe(ErrorCode.INVALID_PARAMETER);
      expect(error.severity).toBe(ErrorSeverity.FATAL);
      expect(error.context).toEqual({ value: 42 });
      expect(error.name).toBe('MotionError');
    });

    it('should create MotionError without context', () => {
      const error = new MotionError(
        'Test error',
        ErrorCode.INVALID_PARAMETER,
        ErrorSeverity.WARNING,
      );

      expect(error.context).toBeUndefined();
    });

    it('should properly identify fatal errors', () => {
      const fatalError = new MotionError('Fatal', ErrorCode.INVALID_CONFIG, ErrorSeverity.FATAL);
      const nonFatalError = new MotionError(
        'Warning',
        ErrorCode.GPU_INIT_FAILED,
        ErrorSeverity.WARNING,
      );

      expect(fatalError.isFatal()).toBe(true);
      expect(nonFatalError.isFatal()).toBe(false);
    });

    it('should properly identify GPU fallback errors', () => {
      const gpuError = new MotionError(
        'GPU failed',
        ErrorCode.GPU_INIT_FAILED,
        ErrorSeverity.ERROR,
      );
      const otherError = new MotionError('Config', ErrorCode.INVALID_CONFIG, ErrorSeverity.FATAL);

      expect(gpuError.shouldFallback()).toBe(true);
      expect(otherError.shouldFallback()).toBe(false);
    });
  });

  describe('Listener Management', () => {
    it('should add and notify listeners', () => {
      const listener = vi.fn();
      handler.addListener(listener);

      const error = new MotionError('Test', ErrorCode.INVALID_PARAMETER, ErrorSeverity.WARNING);
      handler.handle(error);

      expect(listener).toHaveBeenCalledWith(error);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should notify multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      handler.addListener(listener1);
      handler.addListener(listener2);

      const error = new MotionError('Test', ErrorCode.INVALID_PARAMETER, ErrorSeverity.WARNING);
      handler.handle(error);

      expect(listener1).toHaveBeenCalledWith(error);
      expect(listener2).toHaveBeenCalledWith(error);
    });

    it('should remove listeners', () => {
      const listener = vi.fn();
      handler.addListener(listener);
      handler.removeListener(listener);

      const error = new MotionError('Test', ErrorCode.INVALID_PARAMETER, ErrorSeverity.WARNING);
      handler.handle(error);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should isolate listener errors', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failingListener = vi.fn(() => {
        throw new Error('Listener failed');
      });
      const workingListener = vi.fn();

      handler.addListener(failingListener);
      handler.addListener(workingListener);

      const error = new MotionError('Test', ErrorCode.INVALID_PARAMETER, ErrorSeverity.WARNING);
      handler.handle(error);

      expect(failingListener).toHaveBeenCalled();
      expect(workingListener).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should return correct listener count', () => {
      expect(handler.getListenerCount()).toBe(0);

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      handler.addListener(listener1);
      expect(handler.getListenerCount()).toBe(1);

      handler.addListener(listener2);
      expect(handler.getListenerCount()).toBe(2);

      handler.removeListener(listener1);
      expect(handler.getListenerCount()).toBe(1);
    });
  });

  describe('GPU Fallback Handling', () => {
    it('should trigger GPU fallback for GPU errors', () => {
      const error = new MotionError('GPU failed', ErrorCode.GPU_INIT_FAILED, ErrorSeverity.WARNING);

      expect(context.isWebGPUInitialized()).toBe(false);
      context.setWebGPUInitialized(true);
      expect(context.isWebGPUInitialized()).toBe(true);

      handler.handle(error);

      expect(context.isWebGPUInitialized()).toBe(false);
    });

    it('should not trigger GPU fallback for non-GPU errors', () => {
      context.setWebGPUInitialized(true);

      const error = new MotionError(
        'Invalid config',
        ErrorCode.INVALID_CONFIG,
        ErrorSeverity.FATAL,
      );

      expect(() => handler.handle(error)).toThrow(MotionError);
      expect(context.isWebGPUInitialized()).toBe(true);
    });

    it('should handle all GPU error codes', () => {
      context.setWebGPUInitialized(true);

      const gpuErrors = [
        ErrorCode.GPU_INIT_FAILED,
        ErrorCode.GPU_ADAPTER_UNAVAILABLE,
        ErrorCode.GPU_DEVICE_UNAVAILABLE,
        ErrorCode.GPU_PIPELINE_FAILED,
        ErrorCode.GPU_BUFFER_WRITE_FAILED,
      ];

      gpuErrors.forEach((code) => {
        context.setWebGPUInitialized(true);
        const error = new MotionError('GPU error', code, ErrorSeverity.WARNING);
        handler.handle(error);
        expect(context.isWebGPUInitialized()).toBe(false);
      });
    });
  });

  describe('Severity-Based Handling', () => {
    it('should throw fatal errors', () => {
      const error = new MotionError('Fatal', ErrorCode.INVALID_CONFIG, ErrorSeverity.FATAL);

      expect(() => handler.handle(error)).toThrow(MotionError);
      expect(() => handler.handle(error)).toThrow('[INVALID_CONFIG] Fatal');
    });

    it('should not throw ERROR severity errors', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new MotionError('Error', ErrorCode.GPU_INIT_FAILED, ErrorSeverity.ERROR);

      expect(() => handler.handle(error)).not.toThrow();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should not throw WARNING severity errors', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new MotionError('Warning', ErrorCode.RENDERER_NOT_FOUND, ErrorSeverity.WARNING);

      expect(() => handler.handle(error)).not.toThrow();
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('should log FATAL errors before throwing', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new MotionError('Fatal', ErrorCode.INVALID_CONFIG, ErrorSeverity.FATAL, {
        key: 'value',
      });

      expect(() => handler.handle(error)).toThrow();
      expect(consoleError).toHaveBeenCalledWith('[INVALID_CONFIG] Fatal', { key: 'value' });

      consoleError.mockRestore();
    });
  });

  describe('Convenience Methods', () => {
    it('should create and handle error in one call', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const listener = vi.fn();
      handler.addListener(listener);

      handler.create('Test message', ErrorCode.BATCH_EMPTY, ErrorSeverity.WARNING, {
        batchId: 'test',
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const capturedError = listener.mock.calls[0][0];
      expect(capturedError).toBeInstanceOf(MotionError);
      expect(capturedError.message).toBe('[BATCH_EMPTY] Test message');
      expect(capturedError.context).toEqual({ batchId: 'test' });
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('should create and handle fatal error (throws)', () => {
      const listener = vi.fn();
      handler.addListener(listener);

      expect(() =>
        handler.create('Fatal error', ErrorCode.INVALID_GPU_MODE, ErrorSeverity.FATAL),
      ).toThrow(MotionError);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Context Preservation', () => {
    it('should preserve complex context objects', () => {
      const listener = vi.fn();
      handler.addListener(listener);

      const complexContext = {
        values: [1, 2, 3],
        nested: { key: 'value' },
        count: 42,
      };

      const error = new MotionError(
        'Test',
        ErrorCode.BATCH_VALIDATION_FAILED,
        ErrorSeverity.WARNING,
        complexContext,
      );
      handler.handle(error);

      const capturedError = listener.mock.calls[0][0];
      expect(capturedError.context).toEqual(complexContext);
    });

    it('should handle undefined context gracefully', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const error = new MotionError('Test', ErrorCode.SYSTEM_UPDATE_FAILED, ErrorSeverity.WARNING);
      handler.handle(error);

      expect(consoleWarn).toHaveBeenCalledWith('[SYSTEM_UPDATE_FAILED] Test', undefined);

      consoleWarn.mockRestore();
    });
  });

  describe('Integration with AppContext', () => {
    it('should be accessible via AppContext', () => {
      const globalHandler = context.getErrorHandler();
      expect(globalHandler).toBeInstanceOf(ErrorHandler);
    });

    it('should return same instance on multiple calls', () => {
      const handler1 = context.getErrorHandler();
      const handler2 = context.getErrorHandler();
      expect(handler1).toBe(handler2);
    });

    it('should allow custom handler for testing', () => {
      const customHandler = new ErrorHandler(context);
      context.setErrorHandler(customHandler);
      expect(context.getErrorHandler()).toBe(customHandler);
    });
  });

  describe('All Error Codes Coverage', () => {
    it('should handle all configuration error codes', () => {
      const configCodes = [
        ErrorCode.INVALID_CONFIG,
        ErrorCode.INVALID_PARAMETER,
        ErrorCode.INVALID_GPU_MODE,
      ];

      configCodes.forEach((code) => {
        const error = new MotionError('Config error', code, ErrorSeverity.FATAL);
        expect(() => handler.handle(error)).toThrow();
      });
    });

    it('should handle all component error codes', () => {
      const componentCodes = [
        ErrorCode.COMPONENT_NOT_REGISTERED,
        ErrorCode.DUPLICATE_REGISTRATION,
        ErrorCode.INVALID_COMPONENT_NAME,
      ];

      componentCodes.forEach((code) => {
        const error = new MotionError('Component error', code, ErrorSeverity.FATAL);
        expect(() => handler.handle(error)).toThrow();
      });
    });

    it('should handle all animation error codes', () => {
      const animationCodes = [
        ErrorCode.INVALID_MARK_OPTIONS,
        ErrorCode.INVALID_DURATION,
        ErrorCode.INVALID_EASING,
        ErrorCode.INVALID_BEZIER_POINTS,
      ];

      animationCodes.forEach((code) => {
        const error = new MotionError('Animation error', code, ErrorSeverity.FATAL);
        expect(() => handler.handle(error)).toThrow();
      });
    });

    it('should handle all batch error codes', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const batchCodes = [
        ErrorCode.BATCH_EMPTY,
        ErrorCode.BATCH_NOT_FOUND,
        ErrorCode.BATCH_VALIDATION_FAILED,
      ];

      batchCodes.forEach((code) => {
        const error = new MotionError('Batch error', code, ErrorSeverity.FATAL);
        expect(() => handler.handle(error)).toThrow();
      });

      consoleError.mockRestore();
    });

    it('should handle all system error codes', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const systemCodes = [
        ErrorCode.SYSTEM_UPDATE_FAILED,
        ErrorCode.RENDERER_NOT_FOUND,
        ErrorCode.READBACK_FAILED,
      ];

      systemCodes.forEach((code) => {
        const error = new MotionError('System error', code, ErrorSeverity.WARNING);
        expect(() => handler.handle(error)).not.toThrow();
      });

      consoleWarn.mockRestore();
    });
  });
});
