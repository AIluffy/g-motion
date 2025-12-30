import { describe, it, expect, beforeAll } from 'vitest';
import { motion } from '../src/index';

describe('DOM targets', () => {
  it('routes selector with multiple matches to batch (mocked document)', () => {
    if (typeof (global as any).document === 'undefined') {
      (global as any).document = {};
    }
    (global as any).document.querySelectorAll = (sel: string) =>
      sel === '.box'
        ? {
            length: 2,
            item: (index: number) => (index === 0 ? {} : {}),
          }
        : {
            length: 0,
            item: () => null,
          };

    const control = motion('.box')
      .mark([{ at: 100, to: { x: 10 } }])
      .play();

    const count = control.getCount();
    expect(count).toBeGreaterThan(1);
  });
  let el: any;

  beforeAll(() => {
    global.requestAnimationFrame = (cb) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    global.cancelAnimationFrame = (id) => clearTimeout(id);

    el = {
      style: {},
    };

    (global as any).document = {
      querySelector: (sel: string) => (sel === '#box' ? el : null),
    };
    (global as any).window = global;
    (global as any).HTMLElement = class {};
  });

  it.skip('animates DOM element transform (pending real DOM renderer wiring)', async () => {
    motion('#box')
      .mark([{ to: { x: 100 }, at: 100 }])
      .play();

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Expect transform to be applied
    // T021 implementation will determine format
    expect(el.style.transform).toBeDefined();
  });
});
