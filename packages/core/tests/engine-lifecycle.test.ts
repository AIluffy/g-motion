import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine';
import { getWebGPUBufferManager } from '../src/webgpu/buffer';
import { getGPUMetricsProvider } from '../src/webgpu/metrics-provider';
import { World } from '../src/world';

describe('MotionEngine lifecycle', () => {
  it('allows dispose then scheduler.start without throwing', () => {
    const engine = createEngine();
    expect(engine.disposed).toBe(false);
    engine.scheduler.start();
    engine.dispose();
    expect(engine.disposed).toBe(true);
    expect(() => {
      engine.scheduler.start();
    }).not.toThrow();
  });

  it('reset does not throw after dispose', () => {
    const engine = createEngine();
    engine.dispose();
    expect(engine.disposed).toBe(true);
    expect(() => {
      engine.reset();
    }).not.toThrow();
  });

  it('reset clears world state when engine is active', () => {
    const engine = createEngine();
    engine.world.createEntity({});
    expect(Array.from(engine.world.getArchetypes()).length).toBeGreaterThan(0);
    engine.reset();
    expect(engine.disposed).toBe(false);
    expect(Array.from(engine.world.getArchetypes()).length).toBe(0);
    engine.world.createEntity({});
    expect(Array.from(engine.world.getArchetypes()).length).toBeGreaterThan(0);
  });

  it('cleans batch, webgpu buffers and metrics on dispose', () => {
    const engine = createEngine();
    const batchProcessor = engine.services.batchProcessor as any;
    batchProcessor.createBatch('test', [
      {
        id: 1,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
        status: 0,
      },
    ]);
    expect(batchProcessor.getAllBatchIds().length).toBeGreaterThan(0);

    const bufferManager = getWebGPUBufferManager();
    const metrics = getGPUMetricsProvider();

    metrics.recordMetric({ batchId: 'a', entityCount: 1, timestamp: Date.now(), gpu: false });
    expect(metrics.getMetrics().length).toBe(1);

    engine.dispose();

    expect(batchProcessor.getAllBatchIds().length).toBe(0);
    expect(metrics.getMetrics().length).toBe(0);
    expect(bufferManager.getBufferStats().allocationCount).toBe(0);
  });

  it('resetState clears entities on the same world instance', () => {
    const world = new World();
    const id = world.createEntity({});
    expect(typeof id).toBe('number');
    expect(Array.from(world.getArchetypes()).length).toBeGreaterThan(0);

    world.resetState();
    expect(Array.from(world.getArchetypes()).length).toBe(0);
  });
});
