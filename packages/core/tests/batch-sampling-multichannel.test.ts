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
  isStandardTransformChannels,
  KEYFRAME_STRIDE,
  MotionError,
  BatchChannelTable,
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
    // Updated: 2 channels * 4 keyframes per channel * KEYFRAME_STRIDE (10) floats per keyframe
    expect(keyframes.length).toBe(2 * 4 * KEYFRAME_STRIDE);

    // Extract keyframe data using new stride
    const kfX = keyframes.subarray(0, KEYFRAME_STRIDE);
    const kfY = keyframes.subarray(4 * KEYFRAME_STRIDE, 4 * KEYFRAME_STRIDE + KEYFRAME_STRIDE);

    // Verify X channel keyframe
    expect(kfX[0]).toBe(0); // startTime
    expect(kfX[1]).toBe(100); // duration
    expect(kfX[2]).toBe(0); // startValue
    expect(kfX[3]).toBe(10); // endValue

    // Verify Y channel keyframe
    expect(kfY[0]).toBe(0); // startTime
    expect(kfY[1]).toBe(200); // duration
    expect(kfY[2]).toBe(5); // startValue
    expect(kfY[3]).toBe(15); // endValue
  });
});

describe('GPUChannelMappingRegistry standard transform validation', () => {
  it('detects standard transform channel layouts', () => {
    const channels = [
      { index: 0, property: 'x' },
      { index: 1, property: 'y' },
      { index: 2, property: 'rotate' },
      { index: 3, property: 'scaleX' },
      { index: 4, property: 'scaleY' },
      { index: 5, property: 'opacity' },
    ];

    expect(isStandardTransformChannels(channels)).toBe(true);

    const shuffled = [...channels].reverse();
    expect(isStandardTransformChannels(shuffled)).toBe(false);

    const missing = channels.slice(0, 5);
    expect(isStandardTransformChannels(missing)).toBe(false);
  });

  it('classifies batch kinds and enforces primitive stride rules', () => {
    const registry = getGPUChannelMappingRegistry();
    registry.clear();

    const standardTable = createBatchChannelTable('standard', 6, [
      'x',
      'y',
      'rotate',
      'scaleX',
      'scaleY',
      'opacity',
    ]);
    registry.registerBatchChannels(standardTable);
    const standardFromRegistry = registry.getChannels('standard');
    expect(standardTable.kind).toBe('standardTransform');
    expect(standardFromRegistry?.kind).toBe('standardTransform');

    const primitiveTable: BatchChannelTable = {
      batchId: 'primitive-ok',
      stride: 1,
      channels: [{ index: 0, property: '__primitive' }],
    };
    registry.registerBatchChannels(primitiveTable);
    const primitiveFromRegistry = registry.getChannels('primitive-ok');
    expect(primitiveTable.kind).toBe('primitive');
    expect(primitiveFromRegistry?.kind).toBe('primitive');

    expect(() =>
      registry.registerBatchChannels({
        batchId: 'primitive-bad',
        stride: 2,
        channels: [{ index: 0, property: '__primitive' }],
      }),
    ).toThrow(MotionError);
  });
});
