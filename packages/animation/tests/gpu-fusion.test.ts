import { describe, it, expect } from 'vitest';

import { WorldProvider } from '@g-motion/core';
import {
  motion,
  getGPUBatchStatus,
  getGPUMetrics,
  isGPUAvailable,
  engine,
} from '@g-motion/animation';

describe.skip('gpu fusion smoke (browser-only)', () => {
  it('collects status and metrics when above threshold', async () => {
    expect(isGPUAvailable()).toBe(false);
    expect(getGPUBatchStatus().enabled).toBe(false);

    for (let i = 0; i < 5; i++) {
      motion(i)
        .mark([{ to: i + 1, at: 10 }])
        .play();
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(Array.isArray(getGPUMetrics())).toBe(true);
  });

  it('matches CPU vs GPU interpolation in real WebGPU pipeline', async () => {
    if (!isGPUAvailable()) {
      expect(isGPUAvailable()).toBe(false);
      return;
    }

    const world = WorldProvider.useWorld();

    let cpuValue = 0;
    let gpuValue = 0;

    (world.config as any).gpuOnlyInterpolation = false;
    engine.forceGpu('never');

    const cpuTarget = { x: 0 };

    await new Promise<void>((resolve) => {
      motion(cpuTarget)
        .mark([{ to: { x: 100 }, at: 100 }])
        .option({
          onUpdate: () => {
            cpuValue = cpuTarget.x;
          },
          onComplete: () => {
            resolve();
          },
        })
        .play();
    });

    const cpuFinal = cpuValue;

    (world.config as any).gpuOnlyInterpolation = true;
    engine.forceGpu('always');

    const gpuTarget = { x: 0 };

    await new Promise<void>((resolve) => {
      motion(gpuTarget)
        .mark([{ to: { x: 100 }, at: 100 }])
        .option({
          onUpdate: () => {
            gpuValue = gpuTarget.x;
          },
          onComplete: () => {
            resolve();
          },
        })
        .play();
    });

    const gpuFinal = gpuValue;

    expect(gpuFinal).toBeCloseTo(cpuFinal, 2);
  });
});
