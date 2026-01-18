import { createDebugger } from '@g-motion/utils';
import type { AppContext } from './context.js';
import type { ErrorCode } from './errors.js';
import { ErrorSeverity, MotionError } from './errors.js';

const debug = createDebugger('ErrorHandler');
const warn = createDebugger('ErrorHandler', 'warn');
const errorLog = createDebugger('ErrorHandler', 'error');

function logWithSeverity(
  logger: (...args: unknown[]) => void,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger(message, context);
  } else {
    logger(message);
  }
}

export class ErrorHandler {
  private context: AppContext;

  constructor(context: AppContext) {
    this.context = context;
  }

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

  handle(error: MotionError): void {
    this.context.getErrorMonitor().record(error);

    if (error.shouldFallback()) {
      this.context.setWebGPUInitialized(false);
    }

    this.logError(error);

    if (error.isFatal()) {
      throw error;
    }
  }

  private logError(error: MotionError): void {
    switch (error.severity) {
      case ErrorSeverity.FATAL:
      case ErrorSeverity.ERROR:
        logWithSeverity(errorLog, error.message, error.context);
        break;
      case ErrorSeverity.WARNING:
        logWithSeverity(warn, error.message, error.context);
        break;
      case ErrorSeverity.INFO:
        logWithSeverity(debug, error.message, error.context);
        break;
    }
  }
}
