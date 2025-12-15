import { ComputeBatchProcessor } from './systems/batch';
import { BatchContext } from './types';
import { ErrorHandler } from './error-handler.js';

/**
 * Application-level context for managing singleton services and shared state.
 * This replaces the previous globalThis-based approach with proper dependency injection.
 */
export class AppContext {
  private static instance: AppContext;

  private batchProcessor: ComputeBatchProcessor | null = null;
  private batchContext: BatchContext = {};
  private webgpuInitialized = false;
  private errorHandler: ErrorHandler | null = null;

  private constructor() {}

  /**
   * Get the singleton AppContext instance
   */
  static getInstance(): AppContext {
    if (!AppContext.instance) {
      AppContext.instance = new AppContext();
    }
    return AppContext.instance;
  }

  /**
   * Get or create the batch processor
   */
  getBatchProcessor(options?: { maxBatchSize?: number }): ComputeBatchProcessor {
    if (!this.batchProcessor) {
      this.batchProcessor = new ComputeBatchProcessor({
        maxBatchSize: options?.maxBatchSize ?? 1024,
      });
    }
    return this.batchProcessor;
  }

  /**
   * Set the batch processor (useful for testing)
   */
  setBatchProcessor(processor: ComputeBatchProcessor | null): void {
    this.batchProcessor = processor;
  }

  /**
   * Get the batch context (transient state)
   */
  getBatchContext(): BatchContext {
    return this.batchContext;
  }

  /**
   * Update batch context with type-safe partial updates
   */
  updateBatchContext(updates: Partial<BatchContext>): void {
    Object.assign(this.batchContext, updates);
  }

  /**
   * Clear batch context
   */
  clearBatchContext(): void {
    this.batchContext = {};
  }

  /**
   * Check if WebGPU has been initialized
   */
  isWebGPUInitialized(): boolean {
    return this.webgpuInitialized;
  }

  /**
   * Mark WebGPU as initialized
   */
  setWebGPUInitialized(initialized: boolean): void {
    this.webgpuInitialized = initialized;
  }

  /**
   * Get or create the error handler
   */
  getErrorHandler(): ErrorHandler {
    if (!this.errorHandler) {
      this.errorHandler = new ErrorHandler(this);
    }
    return this.errorHandler;
  }

  /**
   * Set the error handler (useful for testing)
   */
  setErrorHandler(handler: ErrorHandler | null): void {
    this.errorHandler = handler;
  }

  /**
   * Reset the singleton (useful for testing)
   */
  static reset(): void {
    AppContext.instance = null as any;
  }
}

/**
 * Get the global app context
 */
export function getAppContext(): AppContext {
  return AppContext.getInstance();
}

/**
 * Get the global error handler
 */
export function getErrorHandler(): ErrorHandler {
  return AppContext.getInstance().getErrorHandler();
}
