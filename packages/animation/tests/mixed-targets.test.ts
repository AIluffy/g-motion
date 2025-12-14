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
      .mark([{ time: 100, to: { value: 10 } }])
      .animate();

    // Expect batch control with count equal or greater than number of inputs (selector expands)
    // @ts-expect-error test-only introspection
    const count = control.getCount ? control.getCount() : 1;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
