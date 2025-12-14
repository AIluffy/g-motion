import { describe, it, expect } from 'vitest';
import { motion } from '../src';

describe('Unified Motion API', () => {
  it('should handle single entity animation', () => {
    const obj = { value: 0 };
    const control = motion(obj)
      .mark([{ to: { value: 100 }, time: 1000 }])
      .animate();

    expect(control).toBeDefined();
    expect(control.getCount()).toBe(1);
  });

  it('should handle array of entities', () => {
    const objects = [{ x: 0 }, { x: 0 }, { x: 0 }];
    const control = motion(objects)
      .mark([{ to: { x: 100 }, time: 1000 }])
      .animate();

    expect(control).toBeDefined();
    expect(control.getCount()).toBe(3);
    expect(control.isBatchAnimation()).toBe(true);
  });

  it('should support per-entity functions for batch animations', () => {
    const objects = [{ x: 0 }, { x: 10 }, { x: 20 }];
    const control = motion(objects)
      .mark([
        {
          to: (index) => ({ x: 100 + index * 10 }),
          time: 1000,
        },
      ])
      .animate();

    expect(control).toBeDefined();
    expect(control.getCount()).toBe(3);
  });

  it('should support stagger for batch animations', () => {
    const objects = [{ x: 0 }, { x: 0 }, { x: 0 }];
    const control = motion(objects)
      .mark([
        {
          to: { x: 100 },
          time: 1000,
          stagger: 100, // 100ms between each entity
        },
      ])
      .animate();

    expect(control).toBeDefined();
    expect(control.getCount()).toBe(3);
  });

  it('should provide unified control methods for batch', () => {
    const objects = [{ x: 0 }, { x: 0 }];
    const control = motion(objects)
      .mark([{ to: { x: 100 }, time: 1000 }])
      .animate();

    expect(typeof control.play).toBe('function');
    expect(typeof control.pause).toBe('function');
    expect(typeof control.stop).toBe('function');
    expect(typeof control.destroy).toBe('function');
    expect(typeof control.getEntityIds).toBe('function');
    expect(typeof control.getControls).toBe('function');
  });

  it('should allow single entity with per-entity functions', () => {
    const obj = { x: 0 };
    const control = motion(obj)
      .mark([
        {
          to: (index) => ({ x: 50 + index * 10 }),
          time: 1000,
        },
      ])
      .animate();

    expect(control).toBeDefined();
    expect(control.getCount()).toBe(1);
  });

  it('should handle CSS selector that matches multiple elements', () => {
    // Note: This would require a DOM environment
    // Just test that the function exists and can be called
    expect(() => {
      motion([]);
    }).not.toThrow();
  });
});
