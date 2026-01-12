import { describe, it, expect, beforeAll } from 'vitest';
import { motion, engine } from '../src';
import { wait } from './test-utils';

describe('GPU regression: CPU vs GPU modes', () => {
  beforeAll(() => {
    const g = global as any;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    g.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number);
  });

  const modes: Array<'never' | 'always'> = ['never', 'always'];

  it('matches numeric interpolation between gpu on and off', async () => {
    const results: number[] = [];

    for (const mode of modes) {
      engine.forceGpu(mode);

      let last = 0;
      const control = motion(0)
        .mark([{ to: 100, at: 100 }])
        .option({
          onUpdate: (v: number) => {
            last = v;
          },
        })
        .play();

      expect(control).toBeDefined();
      await wait(160);
      results.push(last);
    }

    expect(results.length).toBe(2);
    expect(results[0]).toBeCloseTo(results[1], 2);
  });

  it('matches object property interpolation with channel mapping between modes', async () => {
    type Target = { x: number; y: number; opacity: number };

    const snapshots: Target[] = [];

    for (const mode of modes) {
      engine.forceGpu(mode);

      const target: Target = { x: 0, y: 0, opacity: 0 };
      const control = motion(target)
        .mark([{ to: { x: 100, y: 50, opacity: 1 }, at: 120 }])
        .play();

      expect(control).toBeDefined();
      await wait(180);
      snapshots.push({ ...target });
    }

    expect(snapshots.length).toBe(2);
    const a = snapshots[0];
    const b = snapshots[1];
    expect(a.x).toBeCloseTo(b.x, 2);
    expect(a.y).toBeCloseTo(b.y, 2);
    expect(a.opacity).toBeCloseTo(b.opacity, 2);
  });
});
