import { createDebugger } from '@g-motion/utils';
import type { AppContext } from './context.js';
import { ErrorCode, ErrorSeverity, MotionError } from './errors.js';

const debug = createDebugger('ErrorHandler');

export type ErrorListener = (error: MotionError) => void;

export type ErrorScope = 'gpu' | 'batch' | 'system' | 'animation' | 'config' | 'unknown';

export interface ErrorMonitorEvent {
  code: ErrorCode;
  severity: ErrorSeverity;
  message: string;
  scope: ErrorScope;
  timestamp: number;
  context?: Record<string, unknown>;
}

export type ErrorMonitorSink = (event: ErrorMonitorEvent) => void;

export interface ErrorAggregate {
  scope: ErrorScope;
  code: ErrorCode;
  severity: ErrorSeverity;
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
}

function inferErrorScope(code: ErrorCode): ErrorScope {
  if (code.startsWith('GPU_')) return 'gpu';
  if (
    code === ErrorCode.BATCH_EMPTY ||
    code === ErrorCode.BATCH_NOT_FOUND ||
    code === ErrorCode.BATCH_VALIDATION_FAILED
  ) {
    return 'batch';
  }
  if (
    code === ErrorCode.SYSTEM_UPDATE_FAILED ||
    code === ErrorCode.RENDERER_NOT_FOUND ||
    code === ErrorCode.READBACK_FAILED ||
    code === ErrorCode.TARGETS_EMPTY ||
    code === ErrorCode.TARGET_NULL ||
    code === ErrorCode.DOM_ENV_MISSING ||
    code === ErrorCode.INVALID_SELECTOR
  ) {
    return 'system';
  }
  if (
    code === ErrorCode.INVALID_MARK_OPTIONS ||
    code === ErrorCode.INVALID_DURATION ||
    code === ErrorCode.INVALID_EASING ||
    code === ErrorCode.INVALID_BEZIER_POINTS
  ) {
    return 'animation';
  }
  if (
    code === ErrorCode.INVALID_CONFIG ||
    code === ErrorCode.INVALID_PARAMETER ||
    code === ErrorCode.INVALID_GPU_MODE ||
    code === ErrorCode.COMPONENT_NOT_REGISTERED ||
    code === ErrorCode.DUPLICATE_REGISTRATION ||
    code === ErrorCode.INVALID_COMPONENT_NAME
  ) {
    return 'config';
  }
  return 'unknown';
}

export function createErrorMonitorListener(sink: ErrorMonitorSink): ErrorListener {
  return (error: MotionError) => {
    const event: ErrorMonitorEvent = {
      code: error.code,
      severity: error.severity,
      message: error.message,
      scope: inferErrorScope(error.code),
      timestamp: Date.now(),
      context: error.context,
    };
    sink(event);
  };
}

class InMemoryErrorMonitor {
  private events: ErrorMonitorEvent[] = [];
  private aggregates = new Map<string, ErrorAggregate>();
  private maxEvents: number;

  constructor(maxEvents = 200) {
    this.maxEvents = maxEvents;
  }

  record(event: ErrorMonitorEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    const key = `${event.scope}:${event.code}:${event.severity}`;
    const prev = this.aggregates.get(key);
    if (!prev) {
      this.aggregates.set(key, {
        scope: event.scope,
        code: event.code,
        severity: event.severity,
        count: 1,
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      });
    } else {
      prev.count += 1;
      prev.lastTimestamp = event.timestamp;
    }
    this.syncToGlobal(event);
  }

  getEvents(): ErrorMonitorEvent[] {
    return [...this.events];
  }

  getAggregates(): ErrorAggregate[] {
    return Array.from(this.aggregates.values());
  }

  clear(): void {
    this.events = [];
    this.aggregates.clear();
  }

  private syncToGlobal(event: ErrorMonitorEvent): void {
    if (typeof globalThis === 'undefined') return;
    const g = globalThis as any;
    if (!Array.isArray(g.__motionErrors)) {
      g.__motionErrors = [];
    }
    g.__motionErrors.push(event);
    const limit = this.maxEvents;
    if (g.__motionErrors.length > limit) {
      g.__motionErrors.splice(0, g.__motionErrors.length - limit);
    }
  }
}

let errorMonitor: InMemoryErrorMonitor | null = null;

export function getErrorMonitor(): InMemoryErrorMonitor {
  if (!errorMonitor) {
    errorMonitor = new InMemoryErrorMonitor();
  }
  return errorMonitor;
}

export function __resetErrorMonitorForTests(): void {
  errorMonitor = null;
}

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
    try {
      const monitor = getErrorMonitor();
      const listener = createErrorMonitorListener((event) => {
        monitor.record(event);
      });
      this.addListener(listener);
    } catch {}
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
