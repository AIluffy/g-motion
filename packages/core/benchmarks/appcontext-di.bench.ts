import { describe, bench, afterEach } from 'vitest';
import { getAppContext, AppContext } from '../src/context';
import { ComputeBatchProcessor } from '../src/systems/batch';

describe('AppContext Dependency Injection Performance', () => {
  afterEach(() => {
    AppContext.reset();
  });

  bench('AppContext singleton access (optimized DI)', () => {
    for (let i = 0; i < 100000; i++) {
      const ctx = getAppContext();
      if (!ctx) {
        throw new Error('Failed to get context');
      }
    }
  });

  bench('globalThis access (baseline - old behavior)', () => {
    for (let i = 0; i < 100000; i++) {
      const ctx = (globalThis as any).__motionBatchContext;
      if (!ctx) {
        // No-op
      }
    }
  });

  bench('Batch processor retrieval via AppContext', () => {
    const ctx = getAppContext();
    for (let i = 0; i < 10000; i++) {
      const processor = ctx.getBatchProcessor({ maxBatchSize: 1024 });
      if (!processor) {
        throw new Error('Processor not found');
      }
    }
  });

  bench('globalThis batch processor access (baseline)', () => {
    for (let i = 0; i < 10000; i++) {
      const processor = (globalThis as any).__motionBatchProcessor;
      if (!processor) {
        (globalThis as any).__motionBatchProcessor = new ComputeBatchProcessor({
          maxBatchSize: 1024,
        });
      }
    }
  });

  bench('Batch context updates via AppContext', () => {
    const ctx = getAppContext();
    for (let i = 0; i < 10000; i++) {
      ctx.updateBatchContext({
        lastBatchId: `batch-${i}`,
        entityCount: i * 10,
      });
    }
  });

  bench('globalThis batch context updates (baseline)', () => {
    for (let i = 0; i < 10000; i++) {
      if (!(globalThis as any).__motionBatchContext) {
        (globalThis as any).__motionBatchContext = {};
      }
      (globalThis as any).__motionBatchContext.lastBatchId = `batch-${i}`;
      (globalThis as any).__motionBatchContext.entityCount = i * 10;
    }
  });

  bench('Full per-frame context operations (batch)', () => {
    const ctx = getAppContext();

    // Simulate 60 frames of operations
    for (let frame = 0; frame < 60; frame++) {
      ctx.getBatchProcessor({ maxBatchSize: 1024 });
      ctx.updateBatchContext({
        lastBatchId: `batch-${frame}`,
        entityCount: 1000 + frame * 10,
      });
      ctx.getBatchContext();
    }
  });

  bench('Type safety benefit - compile-time property access (no casting)', () => {
    const ctx = getAppContext();
    // With AppContext, no need for 'as any' casts
    const processor = ctx.getBatchProcessor();
    const context = ctx.getBatchContext();

    for (let i = 0; i < 10000; i++) {
      // Safe access without type assertions
      if (processor.getAllBatchIds().length > 0) {
        if (context.lastBatchId) {
          // Use both
        }
      }
    }
  });

  bench('Memory efficiency - AppContext singleton reuse', () => {
    const references: AppContext[] = [];

    // Get the same singleton multiple times
    for (let i = 0; i < 10000; i++) {
      references.push(getAppContext());
    }

    // Verify all are the same instance
    const first = references[0];
    let sameInstance = true;
    for (const ref of references) {
      if (ref !== first) {
        sameInstance = false;
        break;
      }
    }

    if (!sameInstance) {
      throw new Error('AppContext should be a singleton');
    }
  });
});
