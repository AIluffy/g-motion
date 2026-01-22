import { createDebugger } from '@g-motion/utils';
import type { ErrorMonitor } from './monitor';
import type { ErrorCode } from './severity';
import { ErrorSeverity, MotionError } from './severity';

const debug = createDebugger('ErrorHandler');
const warn = createDebugger('ErrorHandler', 'warn');
const errorLog = createDebugger('ErrorHandler', 'error');

/**
 * Function invoked to record errors for aggregation/telemetry.
 */
export type ErrorRecorder = (error: MotionError) => void;

/**
 * Function invoked to log errors for developers.
 */
export type ErrorLogger = (error: MotionError) => void;

/**
 * Function invoked when a fatal error should terminate flow.
 */
export type ErrorFatalHandler = (error: MotionError) => void;

/**
 * Error handler dependency set for explicit injection.
 */
export type ErrorHandlerDependencies = {
  recordError?: ErrorRecorder;
  logError?: ErrorLogger;
  onFatal?: ErrorFatalHandler;
};

/**
 * Adapter surface for legacy AppContext-style injection.
 */
export type ErrorHandlerContextAdapter = {
  getErrorMonitor: () => ErrorMonitor;
};

/**
 * Default error logger that maps MotionError severities to debug channels.
 */
export function logMotionError(error: MotionError): void {
  const { message, context } = error;
  switch (error.severity) {
    case ErrorSeverity.FATAL:
    case ErrorSeverity.ERROR:
      errorLog(message, context);
      break;
    case ErrorSeverity.WARNING:
      warn(message, context);
      break;
    case ErrorSeverity.INFO:
      debug(message, context);
      break;
  }
}

/**
 * Shared error handling flow with explicit dependencies.
 */
export function handleMotionError(error: MotionError, deps: ErrorHandlerDependencies): void {
  const recordError = deps.recordError;
  const logError = deps.logError ?? logMotionError;
  const onFatal =
    deps.onFatal ??
    ((fatalError: MotionError) => {
      throw fatalError;
    });

  if (recordError) {
    try {
      recordError(error);
    } catch (recordFailure) {
      errorLog('Error monitor record failed', {
        error: recordFailure instanceof Error ? recordFailure.message : String(recordFailure),
      });
    }
  }

  if (logError) {
    try {
      logError(error);
    } catch (logFailure) {
      errorLog('Error logger failed', {
        error: logFailure instanceof Error ? logFailure.message : String(logFailure),
      });
    }
  }

  if (error.isFatal()) {
    onFatal(error);
  }
}

/**
 * Adapter factory for legacy context-driven flows.
 */
export function createErrorHandlerFromContext(context: ErrorHandlerContextAdapter): ErrorHandler {
  return new ErrorHandler(context);
}

function isContextAdapter(
  deps: ErrorHandlerDependencies | ErrorHandlerContextAdapter,
): deps is ErrorHandlerContextAdapter {
  return typeof (deps as ErrorHandlerContextAdapter).getErrorMonitor === 'function';
}

function resolveDependencies(
  deps: ErrorHandlerDependencies | ErrorHandlerContextAdapter,
): ErrorHandlerDependencies {
  if (isContextAdapter(deps)) {
    return {
      recordError: (error) => deps.getErrorMonitor().record(error),
    };
  }
  return deps;
}

/**
 * ErrorHandler with explicit dependencies and legacy adapter support.
 */
export class ErrorHandler {
  private readonly dependencies: ErrorHandlerDependencies;

  /**
   * @param deps Context adapter or explicit dependencies for recording/logging errors.
   */
  constructor(deps: ErrorHandlerDependencies | ErrorHandlerContextAdapter) {
    this.dependencies = resolveDependencies(deps);
  }

  /**
   * Create a MotionError, handle it, and return the instance.
   */
  create(
    message: string,
    code: ErrorCode,
    severity: ErrorSeverity,
    context?: Record<string, unknown>,
  ): MotionError {
    const error = new MotionError(message, code, severity, context);
    this.handle(error);
    return error;
  }

  /**
   * Handle a MotionError with injected dependencies.
   */
  handle(error: MotionError): void {
    handleMotionError(error, this.dependencies);
  }
}

export const errorHandler = new ErrorHandler({});
