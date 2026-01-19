import { createDebugger } from '@g-motion/utils';
import type { AppContext } from './context.js';
import type { ErrorCode } from './errors.js';
import { ErrorSeverity, MotionError } from './errors.js';

const debug = createDebugger('ErrorHandler');
const warn = createDebugger('ErrorHandler', 'warn');
const errorLog = createDebugger('ErrorHandler', 'error');

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

    this.logError(error);

    if (error.isFatal()) {
      throw error;
    }
  }

  private logError(error: MotionError): void {
    const { message, context } = error;
    // Direct call - console methods support variadic arguments
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
}
