import { describe, it, expect, beforeAll } from 'vitest';
import { motion, engine } from '../src';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('GPU transform final value', () => {
  beforeAll(() => {
    const g = global as any;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    g.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number);
  });

  const modes: Array<'never' | 'always'> = ['never', 'always'];

  it('reaches exact transform target at timeline end', async () => {
    type Target = { x: number; y: number; scale: number; rotate: number };

    const snapshots: Target[] = [];

    for (const mode of modes) {
      engine.forceGpu(mode);

      const target: Target = { x: 0, y: 0, scale: 1, rotate: 0 };

      const control = motion(target)
        .mark([{ to: { x: 140, y: 140, rotate: 360, scale: 2 }, at: 600 }])
        .play();

      expect(control).toBeDefined();

      await wait(700);

      snapshots.push({ ...target });
    }

    expect(snapshots.length).toBe(2);

    for (const snap of snapshots) {
      expect(snap.x).toBeCloseTo(140, 4);
      expect(snap.y).toBeCloseTo(140, 4);
      expect(snap.rotate).toBeCloseTo(360, 4);
      expect(snap.scale).toBeCloseTo(2, 4);
    }

    const a = snapshots[0];
    const b = snapshots[1];
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.y).toBeCloseTo(b.y, 5);
    expect(a.rotate).toBeCloseTo(b.rotate, 5);
    expect(a.scale).toBeCloseTo(b.scale, 5);
  });
});
