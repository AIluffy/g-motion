import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorHandler } from '../src/error-handler';
import { AppContext, getErrorHandler } from '../src/context';
import { ErrorCode, ErrorSeverity, MotionError } from '../src/errors';

describe('ErrorHandler Integration Tests', () => {
  let context: AppContext;

  beforeEach(() => {
    AppContext.reset();
    context = AppContext.getInstance();
    vi.clearAllMocks();
  });

  describe('WebGPU Fallback Integration', () => {
    it('should handle complete GPU initialization failure flow', async () => {
      // Simulate GPU initialization
      context.setWebGPUInitialized(false);

      const handler = getErrorHandler();
      const listener = vi.fn();
      handler.addListener(listener);

      // Simulate adapter unavailable
      const adapterError = new MotionError(
        'requestAdapter returned null; WebGPU disabled.',
        ErrorCode.GPU_ADAPTER_UNAVAILABLE,
        ErrorSeverity.WARNING,
      );
      handler.handle(adapterError);

      expect(listener).toHaveBeenCalledWith(adapterError);
      expect(context.isWebGPUInitialized()).toBe(false);
    });

    it('should handle device request failure', async () => {
      context.setWebGPUInitialized(true);

      const handler = getErrorHandler();
      const deviceError = new MotionError(
        'requestDevice returned null; WebGPU disabled.',
        ErrorCode.GPU_DEVICE_UNAVAILABLE,
        ErrorSeverity.WARNING,
      );

      handler.handle(deviceError);

      expect(context.isWebGPUInitialized()).toBe(false);
    });

    it('should handle pipeline initialization failure', async () => {
      context.setWebGPUInitialized(true);

      const handler = getErrorHandler();
      const pipelineError = new MotionError(
        'Failed to initialize compute pipeline',
        ErrorCode.GPU_PIPELINE_FAILED,
        ErrorSeverity.ERROR,
        { originalError: 'Shader compilation error' },
      );

      handler.handle(pipelineError);

      expect(context.isWebGPUInitialized()).toBe(false);
    });

    it('should handle buffer write failure without disabling GPU', async () => {
      context.setWebGPUInitialized(true);

      const handler = getErrorHandler();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const bufferError = new MotionError(
        'Buffer write failed',
        ErrorCode.GPU_BUFFER_WRITE_FAILED,
        ErrorSeverity.ERROR,
      );

      handler.handle(bufferError);

      // Buffer errors should trigger fallback
      expect(context.isWebGPUInitialized()).toBe(false);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should maintain CPU path after GPU failure', async () => {
      const handler = getErrorHandler();
      const listener = vi.fn();
      handler.addListener(listener);

      // Initial GPU initialization failure
      context.setWebGPUInitialized(true);
      const initError = new MotionError(
        'Failed to initialize WebGPU device',
        ErrorCode.GPU_INIT_FAILED,
        ErrorSeverity.WARNING,
      );
      handler.handle(initError);

      expect(context.isWebGPUInitialized()).toBe(false);

      // Subsequent operations should work on CPU path
      // (no error thrown, system continues)
      const systemError = new MotionError(
        'System update on CPU',
        ErrorCode.SYSTEM_UPDATE_FAILED,
        ErrorSeverity.WARNING,
      );
      expect(() => handler.handle(systemError)).not.toThrow();

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validation Error Integration', () => {
    it('should handle invalid animation parameters', () => {
      const handler = getErrorHandler();

      const durationError = new MotionError(
        'Mark duration must be non-negative, got: -100ms',
        ErrorCode.INVALID_DURATION,
        ErrorSeverity.FATAL,
        { providedValue: -100 },
      );

      expect(() => handler.handle(durationError)).toThrow(MotionError);
      expect(() => handler.handle(durationError)).toThrow('[INVALID_DURATION]');
    });

    it('should handle invalid easing functions', () => {
      const handler = getErrorHandler();

      const easingError = new MotionError(
        'Mark easing must be a function or string name, got: number',
        ErrorCode.INVALID_EASING,
        ErrorSeverity.FATAL,
        { providedType: 'number' },
      );

      expect(() => handler.handle(easingError)).toThrow(MotionError);
    });

    it('should handle invalid bezier points', () => {
      const handler = getErrorHandler();

      const bezierError = new MotionError(
        'Bezier cx1 and cx2 must be in range [0,1], got: { cx1: 1.5, cx2: -0.2 }',
        ErrorCode.INVALID_BEZIER_POINTS,
        ErrorSeverity.FATAL,
        { cx1: 1.5, cx2: -0.2 },
      );

      expect(() => handler.handle(bezierError)).toThrow('[INVALID_BEZIER_POINTS]');
    });

    it('should handle component not registered errors', () => {
      const handler = getErrorHandler();

      const componentError = new MotionError(
        'Component Transform not registered',
        ErrorCode.COMPONENT_NOT_REGISTERED,
        ErrorSeverity.FATAL,
        { componentName: 'Transform' },
      );

      expect(() => handler.handle(componentError)).toThrow(MotionError);
    });
  });

  describe('Batch Processing Integration', () => {
    it('should handle empty batch creation attempts', () => {
      const handler = getErrorHandler();

      const batchError = new MotionError(
        'Cannot create batch with zero entities',
        ErrorCode.BATCH_EMPTY,
        ErrorSeverity.FATAL,
        { batchId: 'test-batch' },
      );

      expect(() => handler.handle(batchError)).toThrow('[BATCH_EMPTY]');
    });

    it('should handle batch validation failures', () => {
      const handler = getErrorHandler();

      const validationError = new MotionError(
        'Entity count does not match keyframe count',
        ErrorCode.BATCH_VALIDATION_FAILED,
        ErrorSeverity.FATAL,
        { entityCount: 100, keyframeCount: 50 },
      );

      expect(() => handler.handle(validationError)).toThrow();
    });
  });

  describe('System Execution Integration', () => {
    it('should handle system update failures gracefully', () => {
      const handler = getErrorHandler();
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const listener = vi.fn();
      handler.addListener(listener);

      const systemError = new MotionError(
        "System 'RenderSystem' update failed",
        ErrorCode.SYSTEM_UPDATE_FAILED,
        ErrorSeverity.WARNING,
        { systemName: 'RenderSystem', originalError: 'Renderer crashed' },
      );

      expect(() => handler.handle(systemError)).not.toThrow();
      expect(listener).toHaveBeenCalledWith(systemError);
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('should handle missing renderer warnings', () => {
      const handler = getErrorHandler();
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rendererError = new MotionError(
        "Renderer 'CustomRenderer' not found; skipping updates.",
        ErrorCode.RENDERER_NOT_FOUND,
        ErrorSeverity.WARNING,
        { rendererId: 'CustomRenderer', archetypeId: 'MotionState|Transform' },
      );

      expect(() => handler.handle(rendererError)).not.toThrow();
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });

  describe('Multiple Error Scenarios', () => {
    it('should handle cascading GPU errors correctly', () => {
      const handler = getErrorHandler();
      const errors: MotionError[] = [];
      handler.addListener((err) => errors.push(err));

      // 1. Initial GPU init failure
      context.setWebGPUInitialized(true);
      handler.handle(
        new MotionError('GPU init failed', ErrorCode.GPU_INIT_FAILED, ErrorSeverity.WARNING),
      );
      expect(context.isWebGPUInitialized()).toBe(false);

      // 2. Subsequent adapter unavailable (already failed)
      handler.handle(
        new MotionError(
          'Adapter unavailable',
          ErrorCode.GPU_ADAPTER_UNAVAILABLE,
          ErrorSeverity.WARNING,
        ),
      );
      expect(context.isWebGPUInitialized()).toBe(false);

      // 3. System continues on CPU
      handler.handle(
        new MotionError(
          'System running on CPU',
          ErrorCode.SYSTEM_UPDATE_FAILED,
          ErrorSeverity.WARNING,
        ),
      );

      expect(errors).toHaveLength(3);
      expect(errors.every((e) => !e.isFatal())).toBe(true);
    });

    it('should handle mixed severity errors in sequence', () => {
      const handler = getErrorHandler();
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Warning - should not throw
      handler.handle(
        new MotionError('Warning 1', ErrorCode.RENDERER_NOT_FOUND, ErrorSeverity.WARNING),
      );

      // Error - should not throw but log error
      handler.handle(
        new MotionError('Error 1', ErrorCode.GPU_BUFFER_WRITE_FAILED, ErrorSeverity.ERROR),
      );

      // Fatal - should throw
      expect(() =>
        handler.handle(new MotionError('Fatal 1', ErrorCode.INVALID_CONFIG, ErrorSeverity.FATAL)),
      ).toThrow();

      expect(consoleWarn).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledTimes(2); // ERROR + FATAL

      consoleWarn.mockRestore();
      consoleError.mockRestore();
    });
  });

  describe('Global ErrorHandler Access', () => {
    it('should provide global error handler via getErrorHandler()', () => {
      const handler1 = getErrorHandler();
      const handler2 = getErrorHandler();

      expect(handler1).toBe(handler2);
      expect(handler1).toBeInstanceOf(ErrorHandler);
    });

    it('should persist listeners across multiple accesses', () => {
      const handler1 = getErrorHandler();
      const listener = vi.fn();
      handler1.addListener(listener);

      const handler2 = getErrorHandler();
      handler2.handle(
        new MotionError('Test', ErrorCode.SYSTEM_UPDATE_FAILED, ErrorSeverity.WARNING),
      );

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Recovery Patterns', () => {
    it('should allow retry after non-fatal error', () => {
      const handler = getErrorHandler();
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let attempts = 0;
      const maxAttempts = 3;

      const attemptOperation = () => {
        attempts++;
        if (attempts < maxAttempts) {
          handler.handle(
            new MotionError(
              `Attempt ${attempts} failed`,
              ErrorCode.READBACK_FAILED,
              ErrorSeverity.WARNING,
            ),
          );
          return false;
        }
        return true;
      };

      expect(attemptOperation()).toBe(false);
      expect(attemptOperation()).toBe(false);
      expect(attemptOperation()).toBe(true);

      expect(attempts).toBe(3);

      consoleWarn.mockRestore();
    });

    it('should support custom error recovery via listeners', () => {
      const handler = getErrorHandler();
      let fallbackTriggered = false;

      handler.addListener((error) => {
        if (error.code === ErrorCode.GPU_INIT_FAILED) {
          fallbackTriggered = true;
          // Custom recovery logic here
        }
      });

      context.setWebGPUInitialized(true);
      handler.handle(
        new MotionError('GPU failed', ErrorCode.GPU_INIT_FAILED, ErrorSeverity.WARNING),
      );

      expect(fallbackTriggered).toBe(true);
      expect(context.isWebGPUInitialized()).toBe(false);
    });
  });
});
