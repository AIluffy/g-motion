import { describe, it, expect } from 'vitest';
import {
  World,
  BatchSamplingSystem,
  MotionStatus,
  MotionStateComponent,
  TimelineComponent,
  RenderComponent,
  getGPUMetricsProvider,
  getAppContext,
  getErrorHandler,
  getGPUChannelMappingRegistry,
  createBatchChannelTable,
} from '../src';
import { ComputeBatchProcessor } from '../src/systems/batch';

describe('BatchSamplingSystem multi-channel keyframes packing', () => {
  it('packs per-entity per-channel keyframes according to channel mapping', () => {
    const world = new World();
    world.setConfig({ ...world.config, gpuCompute: 'always' });
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.registry.register('Render', RenderComponent);

    const entityId = world.createEntity({
      MotionState: {
        delay: 0,
        startTime: 0,
        pausedAt: 0,
        currentTime: 0,
        playbackRate: 1,
        status: MotionStatus.Running,
        iteration: 0,
      },
      Timeline: {
        tracks: new Map([
          [
            'x',
            [
              {
                startTime: 0,
                time: 100,
                startValue: 0,
                endValue: 10,
                easing: undefined,
              },
            ],
          ],
          [
            'y',
            [
              {
                startTime: 0,
                time: 200,
                startValue: 5,
                endValue: 15,
                easing: undefined,
              },
            ],
          ],
        ]),
        duration: 200,
        loop: 0,
        repeat: 0,
      },
      Render: {
        rendererId: 'object',
        target: { x: 0, y: 0 },
        props: { x: 0, y: 0 },
      },
    });

    const archetype = Array.from(world.getArchetypes())[0];
    const registry = getGPUChannelMappingRegistry();
    registry.clear();
    const table = createBatchChannelTable(archetype.id, 2, ['x', 'y']);
    registry.registerBatchChannels(table);

    const scheduler = world.scheduler;
    const appContext = getAppContext();
    const batchProcessor = new ComputeBatchProcessor();
    const metrics = getGPUMetricsProvider();
    const errorHandler = getErrorHandler();
    const services = {
      world,
      scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor,
      metrics,
      errorHandler,
      appContext,
    } as any;

    scheduler.setServices(services);

    BatchSamplingSystem.update(0, { services, dt: 0 } as any);

    const batches = batchProcessor.getArchetypeBatches();
    expect(batches.size).toBe(1);

    const [, batch] = Array.from(batches.entries())[0];
    expect(batch.entityCount).toBe(1);
    expect(batch.entityIds[0]).toBe(entityId);

    const keyframes = batch.keyframesData;
    expect(keyframes.length).toBe(2 * 4 * 5);
    const kfX = keyframes.subarray(0, 5);
    const kfY = keyframes.subarray(4 * 5, 4 * 5 + 5);

    expect(kfX[0]).toBe(0);
    expect(kfX[1]).toBe(100);
    expect(kfX[2]).toBe(0);
    expect(kfX[3]).toBe(10);
    expect(kfY[0]).toBe(0);
    expect(kfY[1]).toBe(200);
    expect(kfY[2]).toBe(5);
    expect(kfY[3]).toBe(15);
  });
});
