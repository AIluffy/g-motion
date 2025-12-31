import { describe, bench } from 'vitest';
import { World } from '../src/world';
import { MotionStateComponent } from '../src/components/state';
import { TimeSystem } from '../src/systems/time';

function createWorld(entityCount: number, config: any) {
  const world = new World();
  world.registry.register('MotionState', MotionStateComponent);
  world.setConfig({ ...(world.config as any), ...config });
  for (let i = 0; i < entityCount; i++) {
    world.createEntity({
      MotionState: {
        status: 1,
        delay: 0,
        startTime: 0,
        pausedAt: 0,
        currentTime: 0,
        playbackRate: 1,
        iteration: 0,
        tickInterval: 0,
        tickPhase: 0,
        tickPriority: 0,
      },
    });
  }
  return world;
}

describe('Frame sampling vs time sampling', () => {
  const entityCount = 50000;

  bench('TimeSystem (time mode baseline)', () => {
    const world = createWorld(entityCount, { samplingMode: 'time' });
    const services = { world, config: world.config } as any;
    for (let i = 0; i < 60; i++) {
      TimeSystem.update(16.67, { services, dt: 16.67 } as any);
    }
  });

  bench('TimeSystem (frame mode, 24fps)', () => {
    const world = createWorld(entityCount, { samplingMode: 'frame', samplingFps: 24 });
    const services = { world, config: world.config } as any;
    const frameDt = 1000 / 24;
    for (let i = 0; i < 60; i++) {
      const deltaTimeMs = i % 2 === 0 ? 0 : frameDt;
      TimeSystem.update(16.67, { services, dt: 16.67, sampling: { deltaTimeMs } } as any);
    }
  });
});
