import { describe, it, expect, vi } from 'vitest';
import {
  World,
  MotionStatus,
  MotionStateComponent,
  TimelineComponent,
  RenderComponent,
  RenderSystem,
  getRendererCode,
} from '../src';
import { ActiveEntityMonitorSystem } from '../src/systems/active-entity-monitor';

describe('ActiveEntityMonitorSystem', () => {
  it('syncs scheduler from incremental active motion count', () => {
    const world = new World();
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.registry.register('Render', RenderComponent);

    const runningId = world.createEntity({
      MotionState: {
        status: MotionStatus.Running,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
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
      MotionState: {
        status: MotionStatus.Paused,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
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
      MotionState: {
        status: MotionStatus.Finished,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
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

    expect(world.getActiveMotionEntityCount()).toBe(2);
    expect(world.scheduler.getActiveEntityCount()).toBe(2);

    ActiveEntityMonitorSystem.update(0, {
      services: {
        world,
        scheduler: world.scheduler,
        app: {} as any,
        config: world.config,
        batchProcessor: {} as any,
        metrics: {} as any,
        errorHandler: {} as any,
        appContext: {} as any,
      },
      dt: 0,
    } as any);

    expect(world.scheduler.getActiveEntityCount()).toBe(2);

    world.setMotionStatus(runningId, MotionStatus.Finished);
    expect(world.getActiveMotionEntityCount()).toBe(1);
    expect(world.scheduler.getActiveEntityCount()).toBe(1);
  });

  it('skips renderer updates when Render version unchanged', () => {
    const world = new World();
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.registry.register('Render', RenderComponent);

    world.createEntity({
      MotionState: {
        status: MotionStatus.Paused,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
      },
      Timeline: {
        tracks: new Map(),
        duration: 1000,
        loop: 0,
        repeat: 0,
      },
      Render: {
        rendererId: 'wrong',
        rendererCode: getRendererCode('test'),
        target: {},
        props: {},
        version: 0,
        renderedVersion: -1,
      },
    });

    const rendererUpdate = vi.fn();
    const app = {
      getRenderer: (name: string) => (name === 'test' ? { update: rendererUpdate } : undefined),
    } as any;

    const ctx = {
      services: {
        world,
        scheduler: world.scheduler,
        app,
        config: world.config,
        batchProcessor: {} as any,
        metrics: {} as any,
        errorHandler: { handle: vi.fn() } as any,
        appContext: {} as any,
      },
      dt: 0,
    } as any;

    RenderSystem.update(0, ctx);
    expect(rendererUpdate).toHaveBeenCalledTimes(1);

    RenderSystem.update(0, ctx);
    expect(rendererUpdate).toHaveBeenCalledTimes(1);

    const archetype = Array.from(world.getArchetypes())[0];
    const renderBuffer = archetype.getBuffer('Render') as any[];
    renderBuffer[0].version += 1;
    RenderSystem.update(0, ctx);
    expect(rendererUpdate).toHaveBeenCalledTimes(2);
  });
});
