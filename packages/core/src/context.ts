import {
  BatchContext,
  ErrorHandler,
  ErrorMonitor,
  createErrorHandlerFromContext,
} from '@g-motion/shared';
import { createDebugger } from '@g-motion/shared';
import type { ShaderDef } from './plugin';
import { ComputeBatchProcessor } from './systems/batch';

const warn = createDebugger('AppContext', 'warn');

export type BatchProcessorFactory = (options?: { maxBatchSize?: number }) => ComputeBatchProcessor;
export type ErrorHandlerFactory = (context: AppContext) => ErrorHandler;
export type ErrorMonitorFactory = (context: AppContext) => ErrorMonitor;

export interface AppContextFactories {
  createBatchProcessor?: BatchProcessorFactory;
  createErrorHandler?: ErrorHandlerFactory;
  createErrorMonitor?: ErrorMonitorFactory;
}

/**
 * Application-level context for managing singleton services and shared state.
 * This replaces the previous globalThis-based approach with proper dependency injection.
 */
export class AppContext {
  private static instance: AppContext | null = null;
  private static defaultFactories: Required<AppContextFactories> =
    AppContext.buildDefaultFactories();

  private batchProcessor: ComputeBatchProcessor | null = null;
  private batchContext: BatchContext = {};
  private errorHandler: ErrorHandler | null = null;
  private errorMonitor: ErrorMonitor | null = null;
  private shaderRegistry: Map<string, ShaderDef> | null = null;

  private factories: Required<AppContextFactories>;

  private constructor(factories: Required<AppContextFactories>) {
    this.factories = factories;
  }

  private static buildDefaultFactories(): Required<AppContextFactories> {
    return {
      createBatchProcessor: (options) =>
        new ComputeBatchProcessor({
          maxBatchSize: options?.maxBatchSize ?? 1024,
        }),
      createErrorHandler: (context) => createErrorHandlerFromContext(context),
      createErrorMonitor: (_context) => new ErrorMonitor(),
    };
  }

  static configure(options: { factories?: AppContextFactories }): void {
    if (options.factories) {
      Object.assign(AppContext.defaultFactories, options.factories);
      AppContext.instance?.setFactories(options.factories);
    }
  }

  /**
   * Get the singleton AppContext instance
   */
  static getInstance(): AppContext {
    if (!AppContext.instance) {
      AppContext.instance = new AppContext(AppContext.defaultFactories);
    }
    return AppContext.instance;
  }

  /**
   * Get or create the batch processor
   */
  getBatchProcessor(options?: { maxBatchSize?: number }): ComputeBatchProcessor {
    if (!this.batchProcessor) {
      this.batchProcessor = this.factories.createBatchProcessor(options);
    }
    return this.batchProcessor;
  }

  setFactories(factories: AppContextFactories): void {
    Object.assign(this.factories, factories);
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
   * Get or create the error handler
   */
  getErrorHandler(): ErrorHandler {
    if (!this.errorHandler) {
      this.errorHandler = this.factories.createErrorHandler(this);
    }
    return this.errorHandler;
  }

  /**
   * Set the error handler (useful for testing)
   */
  setErrorHandler(handler: ErrorHandler | null): void {
    this.errorHandler = handler;
  }

  getErrorMonitor(): ErrorMonitor {
    if (!this.errorMonitor) {
      this.errorMonitor = this.factories.createErrorMonitor(this);
    }
    return this.errorMonitor;
  }

  setErrorMonitor(monitor: ErrorMonitor | null): void {
    this.errorMonitor = monitor;
  }

  getShaderRegistry(): Map<string, ShaderDef> {
    if (!this.shaderRegistry) {
      this.shaderRegistry = new Map();
    }
    return this.shaderRegistry;
  }

  /**
   * Reset the singleton (useful for testing)
   */
  static reset(): void {
    AppContext.instance?.dispose();
    AppContext.instance = null;
  }

  dispose(): void {
    try {
      this.batchProcessor?.clear();
    } catch (e) {
      warn('Context cleanup failed:', e);
    }
    this.batchProcessor = null;
    this.batchContext = {};
    this.errorHandler = null;
    this.errorMonitor = null;
    this.shaderRegistry = null;
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

export function getErrorMonitor(): ErrorMonitor {
  return AppContext.getInstance().getErrorMonitor();
}
