import { describe, it, expect, vi, beforeAll } from 'vitest';
import { motion, engine } from '../src';
import type { Keyframe } from '@g-motion/core';
import { getProgress } from '../src/api/timeline';
import { wait } from './test-utils';

describe('GPU time semantics vs CPU', () => {
  beforeAll(() => {
    const g = global as any;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    g.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number);
  });

  const modes: Array<'never' | 'always'> = ['never', 'always'];

  it('respects delay in both GPU on and off modes', async () => {
    for (const mode of modes) {
      engine.forceGpu(mode);

      const onUpdate = vi.fn();

      motion(0)
        .mark([{ to: 10, at: 50 }])
        .option({ onUpdate, delay: 40 })
        .play();

      await wait(30);
      expect(onUpdate).not.toHaveBeenCalled();

      await wait(40);
      expect(onUpdate).toHaveBeenCalled();
    }
  });

  it('honors repeat behavior consistently for GPU on and off', async () => {
    for (const mode of modes) {
      engine.forceGpu(mode);

      const onUpdate = vi.fn();

      motion(0)
        .mark([{ to: 20, at: 30 }])
        .option({ onUpdate, repeat: 1 })
        .play();

      await wait(90);

      const lastValue = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
      expect(lastValue).toBeCloseTo(20, 0);
    }
  });

  it('keeps seek semantics consistent for GPU modes', () => {
    for (const mode of modes) {
      engine.forceGpu(mode);

      const ctrl = motion(0)
        .mark([{ to: 100, duration: 500 }])
        .mark([{ to: 200, duration: 500 }])
        .play();

      expect(ctrl.getDuration()).toBe(1000);

      ctrl.seek(400);
      expect(ctrl.getCurrentTime()).toBe(400);

      ctrl.seek(5000);
      expect(ctrl.getCurrentTime()).toBe(1000);

      ctrl.seek(-10);
      expect(ctrl.getCurrentTime()).toBe(0);
    }
  });

  it('matches CPU vs GPU-style timeline output including end behavior', () => {
    const kf: Keyframe = {
      startTime: 0,
      time: 100,
      startValue: 0,
      endValue: 100,
      easing: 'linear',
    } as any;

    const samples = [0, 25, 50, 75, 100, 150];
    const cpuValues: number[] = [];
    const gpuValues: number[] = [];

    for (const t of samples) {
      const { progress } = getProgress(t, kf);
      const cpu = kf.startValue + (kf.endValue - kf.startValue) * progress;
      cpuValues.push(cpu);

      const duration = Math.max(0, kf.time - kf.startTime);
      const raw = duration === 0 ? 1 : (t - kf.startTime) / duration;
      const clamped = Math.min(1, Math.max(0, raw));
      const gpu = kf.startValue + (kf.endValue - kf.startValue) * clamped;
      gpuValues.push(gpu);
    }

    expect(cpuValues.length).toBe(gpuValues.length);
    for (let i = 0; i < cpuValues.length; i++) {
      expect(gpuValues[i]).toBeCloseTo(cpuValues[i], 5);
    }
  });
});
