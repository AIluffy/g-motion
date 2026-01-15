import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { MotionStateComponent } from '../src/components/state';
import { TimelineComponent } from '../src/components/timeline';
import { TimeSystem } from '../src/systems/time';

describe('Frame-based sampling', () => {
  it('advances time only on sampling frame boundaries', () => {
    const world = new World();
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.setConfig({ ...(world.config as any), samplingMode: 'frame', samplingFps: 25 });

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
      Timeline: { duration: 1000, loop: 0, repeat: 0, tracks: new Map() },
    });

    const archetype = Array.from(world.getArchetypes())[0];
    const buf = archetype.getBuffer('MotionState') as any[];

    const services = { world, config: world.config } as any;
    let nowMs = 0;
    TimeSystem.update(16, { services, dt: 16, nowMs, sampling: { deltaTimeMs: 0 } as any } as any);
    expect(buf[0].currentTime).toBeCloseTo(0, 6);

    nowMs += 40;
    TimeSystem.update(16, { services, dt: 16, nowMs, sampling: { deltaTimeMs: 40 } as any } as any);
    expect(buf[0].currentTime).toBeCloseTo(40, 6);

    TimeSystem.update(16, { services, dt: 16, nowMs, sampling: { deltaTimeMs: 0 } as any } as any);
    expect(buf[0].currentTime).toBeCloseTo(40, 6);
  });

  it('supports fractional sampling fps with quantized deltaTimeMs', () => {
    const world = new World();
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.setConfig({ ...(world.config as any), samplingMode: 'frame', samplingFps: 23.976 });

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
      Timeline: { duration: 1000, loop: 0, repeat: 0, tracks: new Map() },
    });

    const archetype = Array.from(world.getArchetypes())[0];
    const buf = archetype.getBuffer('MotionState') as any[];

    const services = { world, config: world.config } as any;
    const frameDuration = 1000 / 23.976;

    TimeSystem.update(50, {
      services,
      dt: 50,
      nowMs: frameDuration,
      sampling: { deltaTimeMs: frameDuration } as any,
    } as any);
    expect(buf[0].currentTime).toBeCloseTo(frameDuration, 6);
  });
});
