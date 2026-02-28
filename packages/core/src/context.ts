import { BatchContext } from '@g-motion/shared';
import { createDebugger } from '@g-motion/shared';
import type { ShaderDef } from './plugin';
import { ComputeBatchProcessor } from './systems/batch';

const warn = createDebugger('AppContext', 'warn');

export type BatchProcessorFactory = (options?: { maxBatchSize?: number }) => ComputeBatchProcessor;
export interface AppContextFactories {
  createBatchProcessor?: BatchProcessorFactory;
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
// Error handling is intentionally minimal; no global error handler provided.
