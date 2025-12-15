import { createDebugger } from '@g-motion/utils';
import type { AppContext } from './context.js';
import { ErrorCode, ErrorSeverity, MotionError } from './errors.js';

const debug = createDebugger('ErrorHandler');

/**
 * Listener function type for error events
 */
export type ErrorListener = (error: MotionError) => void;

/**
 * Centralized error handling for Motion animation engine
 * Provides:
 * - Typed error codes and severity levels
 * - Listener pattern for custom error handling
 * - Automatic fallback strategies (e.g., GPU → CPU)
 * - Consistent logging based on severity
 */
export class ErrorHandler {
  private listeners = new Set<ErrorListener>();
  private context: AppContext;

  constructor(context: AppContext) {
    this.context = context;
  }

  /**
   * Handle an error with appropriate strategy based on severity
   * @param error MotionError to handle
   */
  handle(error: MotionError): void {
    // Notify all listeners (catch errors to prevent cascading failures)
    this.notifyListeners(error);

    // Apply recovery strategies
    if (error.shouldFallback()) {
      this.handleGPUFallback(error);
    }

    // Log based on severity
    this.logError(error);

    // Throw if fatal (caller must handle)
    if (error.isFatal()) {
      throw error;
    }
  }

  /**
   * Create and handle an error in one call (convenience method)
   * @param message Error message
   * @param code Error code
   * @param severity Error severity
   * @param context Additional context
   */
  create(
    message: string,
    code: ErrorCode,
    severity: ErrorSeverity,
    context?: Record<string, unknown>,
  ): void {
    const error = new MotionError(message, code, severity, context);
    this.handle(error);
  }

  /**
   * Add a listener for error events
   * @param listener Function to call when errors occur
   */
  addListener(listener: ErrorListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a listener
   * @param listener Function to remove
   */
  removeListener(listener: ErrorListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Get current number of registered listeners
   */
  getListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Notify all listeners of an error (with error isolation)
   */
  private notifyListeners(error: MotionError): void {
    this.listeners.forEach((listener) => {
      try {
        listener(error);
      } catch (listenerError) {
        // Prevent listener errors from breaking error handling
        console.error('[ErrorHandler] Listener error:', listenerError);
      }
    });
  }

  /**
   * Handle GPU fallback by updating AppContext and metrics
   */
  private handleGPUFallback(error: MotionError): void {
    // Disable WebGPU in AppContext
    this.context.setWebGPUInitialized(false);

    // Update GPU metrics if available
    // Note: Import is delayed to avoid circular dependencies at module load time
    try {
      // Use dynamic import to lazily load metrics provider
      import('./webgpu/metrics-provider.js')
        .then(({ getGPUMetricsProvider }) => {
          getGPUMetricsProvider().updateStatus({
            webgpuAvailable: false,
            gpuInitialized: false,
          });
        })
        .catch((e) => {
          // Metrics provider might not be available in all contexts
          debug('Could not update GPU metrics:', e);
        });
    } catch (e) {
      // Silently fail if metrics not available
      debug('Could not update GPU metrics:', e);
    }

    debug('GPU fallback triggered - switching to CPU path', error.context);
  }

  /**
   * Log error with appropriate level based on severity
   */
  private logError(error: MotionError): void {
    const logContext = error.context ? error.context : undefined;

    switch (error.severity) {
      case ErrorSeverity.FATAL:
      case ErrorSeverity.ERROR:
        console.error(error.message, logContext);
        break;
      case ErrorSeverity.WARNING:
        console.warn(error.message, logContext);
        break;
      case ErrorSeverity.INFO:
        debug(error.message, logContext);
        break;
    }
  }
}
