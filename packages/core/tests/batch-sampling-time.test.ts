import { describe, it, expect } from 'vitest';
import {
  World,
  TimeSystem,
  BatchSamplingSystem,
  MotionStatus,
  MotionStateComponent,
  TimelineComponent,
  RenderComponent,
  getGPUMetricsProvider,
  getAppContext,
  getErrorHandler,
} from '../src';
import { ComputeBatchProcessor } from '../src/systems/batch';

describe('BatchSamplingSystem time semantics', () => {
  it('packs MotionState.currentTime into GPU states buffer (timeline time)', () => {
    const world = new World();
    world.setConfig({ ...world.config, gpuCompute: 'always' });
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.registry.register('Render', RenderComponent);

    world.createEntity({
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
        tracks: new Map(),
        duration: 1000,
        loop: 0,
        repeat: 0,
      },
      Render: {
        rendererId: 'primitive',
        target: { value: 0 },
        props: { value: 0 },
      },
    });

    const archetype = Array.from(world.getArchetypes())[0];
    const stateBuffer = archetype.getBuffer('MotionState') as Array<{
      status: MotionStatus;
      delay: number;
      startTime: number;
      currentTime: number;
      playbackRate: number;
    }>;

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

    const dt = 100;
    TimeSystem.update(dt, { services, dt });

    BatchSamplingSystem.update(0, { services, dt: 0 } as any);

    const batches = batchProcessor.getArchetypeBatches();
    expect(batches.size).toBe(1);

    const [, batch] = Array.from(batches.entries())[0];
    expect(batch.entityCount).toBe(1);

    const statesBufferFlat = batch.statesData;
    expect(statesBufferFlat).toBeInstanceOf(Float32Array);

    const startTime = statesBufferFlat[0];
    const currentTime = statesBufferFlat[1];
    const playbackRate = statesBufferFlat[2];

    expect(startTime).toBe(0);
    expect(currentTime).toBeCloseTo(stateBuffer[0].currentTime, 5);
    expect(playbackRate).toBe(1);
    expect(currentTime).toBeGreaterThan(0);
  });

  it('supports work slicing by processing archetypes across frames', () => {
    const world = new World();
    world.setConfig({
      ...world.config,
      gpuCompute: 'always',
      workSlicing: { enabled: true, batchSamplingArchetypesPerFrame: 1 },
    });
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.registry.register('Render', RenderComponent);
    world.registry.register('Extra', { schema: { x: 'float32' } } as any);

    world.createEntity({
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
        tracks: new Map(),
        duration: 1000,
        loop: 0,
        repeat: 0,
      },
      Render: {
        rendererId: 'primitive',
        target: { value: 0 },
        props: { value: 0 },
      },
    });

    world.createEntity({
      Extra: { x: 1 },
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
        tracks: new Map(),
        duration: 1000,
        loop: 0,
        repeat: 0,
      },
      Render: {
        rendererId: 'primitive',
        target: { value: 0 },
        props: { value: 0 },
      },
    });

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

    TimeSystem.update(16, { services, dt: 16 });

    BatchSamplingSystem.update(0, { services, dt: 0 } as any);
    const keys1 = Array.from(batchProcessor.getArchetypeBatches().keys());
    expect(keys1.length).toBe(1);

    BatchSamplingSystem.update(0, { services, dt: 0 } as any);
    const keys2 = Array.from(batchProcessor.getArchetypeBatches().keys());
    expect(keys2.length).toBe(1);
    expect(keys2[0]).not.toBe(keys1[0]);

    const all = new Set([...keys1, ...keys2]);
    expect(all.size).toBe(2);
  });
});
