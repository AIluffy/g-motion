import { describe, it, expect } from 'vitest';
import { motion } from '../src/index';

describe('Mixed target arrays', () => {
  it('animates heterogeneous targets via motion([]) routing to batch', () => {
    // Minimal mock for document selector resolution
    (global as any).document = (global as any).document || {};
    (global as any).document.querySelectorAll = (sel: string) => (sel === '.m' ? [{}, {}] : []);

    const obj = { value: 0 };
    const targets = [42, obj, '.m'];

    const control = motion(targets)
      .mark([{ at: 100, to: { value: 10 } }])
      .play();

    const count = control.getCount();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
