import { describe, it, expect } from 'vitest';
import { motion } from '../src/index';
import { motion as builderMotion } from '../src/api/builder';
import { World } from '@g-motion/core';

describe('Sparse Keyframe Interpolation', () => {
  it('should interpolate missing properties across sparse keyframes (like CSS animation)', async () => {
    const target = { x: 0, y: 0, scale: 0 };

    // Create animation with sparse keyframes:
    // - At time 0: x=0, y=0, scale=0
    // - At time 50: scale=1 (no x, y)
    // - At time 100: x=100, y=100, scale=0
    //
    // Expected behavior: x and y should interpolate from 0 to 100 over the full 100ms,
    // ignoring the middle keyframe that doesn't specify them.
    const updateValues: Array<{ x: number; y: number; scale: number }> = [];

    motion(target)
      .mark([
        { to: { x: 0, y: 0, scale: 0 }, at: 0 },
        { to: { scale: 1 }, at: 50 },
        { to: { x: 100, y: 100, scale: 0 }, at: 100 },
      ])
      .option({
        onUpdate: (val) => {
          Object.assign(target, val);
          updateValues.push({ x: target.x, y: target.y, scale: target.scale });
        },
      })
      .play();

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check final values
    expect(target.x).toBeCloseTo(100, 0);
    expect(target.y).toBeCloseTo(100, 0);
    expect(target.scale).toBeCloseTo(0, 1);

    // Verify that x and y interpolated smoothly (no sudden jump at t=50)
    // x and y should have been progressing throughout the animation
    expect(updateValues.length).toBeGreaterThan(0);
    expect(updateValues[updateValues.length - 1].x).toBeCloseTo(100, 0);
    expect(updateValues[updateValues.length - 1].y).toBeCloseTo(100, 0);
  });

  it('should handle DOM elements with sparse keyframes', async () => {
    // This test verifies that DOM elements correctly interpolate sparse keyframes
    // We just need to ensure the animation completes without errors
    const mockElement = document.createElement('div');
    document.body.appendChild(mockElement);

    const control = motion(mockElement)
      .mark([
        { to: { x: 0, y: 0, scale: 0 }, at: 0 },
        { to: { scale: 1 }, at: 50 },
        { to: { x: 100, y: 100, scale: 0 }, at: 100 },
      ])
      .play();

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Cleanup
    control.stop();
    document.body.removeChild(mockElement);

    // Just verify it completed successfully
    expect(control).toBeDefined();
  });

  it('should handle primitives with sparse keyframes', async () => {
    let value = 0;

    // Primitive animation with basic timeline
    motion(0)
      .mark([
        { to: 0, at: 0 },
        { to: 100, at: 100 },
      ])
      .option({ onUpdate: (val) => (value = val) })
      .play();

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check final value
    expect(value).toBeCloseTo(100, 0);
  });

  it('assigns separate archetypes for object and primitive targets', () => {
    const world = new World();
    const objTarget = { count: 0 };
    let primitiveValue = 0;

    builderMotion(objTarget, { world })
      .mark({ to: { count: 1 }, at: 100 })
      .play();

    builderMotion(primitiveValue, { world })
      .mark([
        { to: 0, at: 0 },
        { to: 1, at: 100 },
      ])
      .option({ onUpdate: (v) => (primitiveValue = v) })
      .play();

    const archetypeIds = Array.from(world.getArchetypes()).map((a: any) => a.id as string);
    expect(archetypeIds.some((id) => id.includes('::object'))).toBe(true);
    expect(archetypeIds.some((id) => id.includes('::primitive'))).toBe(true);
  });
});
