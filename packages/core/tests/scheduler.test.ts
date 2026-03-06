import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemScheduler } from '../src/scheduler/scheduler';
import type { SystemDef } from '../src/runtime/plugin';

describe('SystemScheduler', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  it('warns on write conflicts for systems with same phase and order in dev mode', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scheduler = new SystemScheduler();

    const systemA: SystemDef = {
      name: 'SystemA',
      phase: 'update',
      order: 10,
      writes: ['MotionState.currentTime'],
      update: () => undefined,
    };

    const systemB: SystemDef = {
      name: 'SystemB',
      phase: 'update',
      order: 10,
      writes: ['MotionState.currentTime'],
      update: () => undefined,
    };

    scheduler.add(systemA);
    scheduler.add(systemB);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('System "SystemB" and "SystemA" both write to "MotionState.currentTime"'),
    );

    warnSpy.mockRestore();
  });

  it('does not warn when order differs even with same write field', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scheduler = new SystemScheduler();

    scheduler.add({
      name: 'SystemA',
      phase: 'update',
      order: 10,
      writes: ['MotionState.currentTime'],
      update: () => undefined,
    });

    scheduler.add({
      name: 'SystemB',
      phase: 'update',
      order: 11,
      writes: ['MotionState.currentTime'],
      update: () => undefined,
    });

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
