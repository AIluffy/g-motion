/**
 * Error codes used throughout the Motion animation engine
 */
export enum ErrorCode {
  // Configuration Errors (throw immediately)
  INVALID_CONFIG = 'INVALID_CONFIG',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INVALID_GPU_MODE = 'INVALID_GPU_MODE',

  // Component/Registration Errors (throw immediately)
  COMPONENT_NOT_REGISTERED = 'COMPONENT_NOT_REGISTERED',
  DUPLICATE_REGISTRATION = 'DUPLICATE_REGISTRATION',
  INVALID_COMPONENT_NAME = 'INVALID_COMPONENT_NAME',

  // Animation Parameter Errors (throw immediately)
  INVALID_MARK_OPTIONS = 'INVALID_MARK_OPTIONS',
  INVALID_DURATION = 'INVALID_DURATION',
  INVALID_EASING = 'INVALID_EASING',
  INVALID_BEZIER_POINTS = 'INVALID_BEZIER_POINTS',

  // WebGPU Errors (handle gracefully, fallback to CPU)
  GPU_INIT_FAILED = 'GPU_INIT_FAILED',
  GPU_ADAPTER_UNAVAILABLE = 'GPU_ADAPTER_UNAVAILABLE',
  GPU_DEVICE_UNAVAILABLE = 'GPU_DEVICE_UNAVAILABLE',
  GPU_PIPELINE_FAILED = 'GPU_PIPELINE_FAILED',
  GPU_BUFFER_WRITE_FAILED = 'GPU_BUFFER_WRITE_FAILED',

  // Batch Processing Errors (handle gracefully)
  BATCH_EMPTY = 'BATCH_EMPTY',
  BATCH_NOT_FOUND = 'BATCH_NOT_FOUND',
  BATCH_VALIDATION_FAILED = 'BATCH_VALIDATION_FAILED',

  // System Execution Errors (log and continue)
  SYSTEM_UPDATE_FAILED = 'SYSTEM_UPDATE_FAILED',
  RENDERER_NOT_FOUND = 'RENDERER_NOT_FOUND',
  READBACK_FAILED = 'READBACK_FAILED',
}

/**
 * Error severity levels determining handling strategy
 */
export enum ErrorSeverity {
  /** Fatal errors - throw immediately (config/validation errors) */
  FATAL = 'fatal',
  /** Errors - log + fallback (GPU initialization) */
  ERROR = 'error',
  /** Warnings - log + continue (missing renderer) */
  WARNING = 'warning',
  /** Info - debug logging only */
  INFO = 'info',
}

/**
 * Custom error class for Motion animation engine
 * Provides typed error codes, severity levels, and contextual data
 */
export class MotionError extends Error {
  /**
   * @param message Human-readable error message
   * @param code Machine-readable error code from ErrorCode enum
   * @param severity Error severity level determining handling strategy
   * @param context Additional contextual data for debugging
   */
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly severity: ErrorSeverity,
    public readonly context?: Record<string, unknown>,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'MotionError';

    // Maintain proper stack trace in V8 (Node.js/Chromium)
    // Check for captureStackTrace as it's not in standard Error but exists in V8
    const ErrorWithCapture = Error as any;
    if (typeof ErrorWithCapture.captureStackTrace === 'function') {
      ErrorWithCapture.captureStackTrace(this, MotionError);
    }
  }

  /**
   * Check if this is a fatal error that should stop execution
   */
  isFatal(): boolean {
    return this.severity === ErrorSeverity.FATAL;
  }

  /**
   * Check if this error should trigger GPU fallback
   */
  shouldFallback(): boolean {
    return this.code.startsWith('GPU_');
  }
}
