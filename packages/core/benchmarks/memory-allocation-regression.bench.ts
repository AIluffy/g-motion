import { describe, bench, expect, beforeEach } from 'vitest';
import { World } from '../src/world';

describe('Zero Allocation Test', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  bench('Zero allocation per frame - 100 entities over 10000 frames', () => {
    // Create 100 entities with motion state
    const entities: number[] = [];
    for (let i = 0; i < 100; i++) {
      const entity = world.entity();
      entity.add('MotionState', {
        status: 1, // Playing
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
      });
      entity.add('Timeline', {
        data: new Map(),
        duration: 1000,
      });
      entity.add('Render', {
        rendererId: 'object',
        target: { value: 0 },
        props: { value: 0 },
      });
      entities.push(entity.getId());
    }

    // Capture initial heap
    const initialHeap = process.memoryUsage().heapUsed;

    // Run 10000 frame updates
    for (let frame = 0; frame < 10000; frame++) {
      world.step(16); // 16ms per frame
    }

    // Capture final heap
    const finalHeap = process.memoryUsage().heapUsed;
    const allocated = finalHeap - initialHeap;
    const allocatedKB = allocated / 1024;

    console.log(`Allocated: ${allocatedKB.toFixed(2)}KB over 10000 frames`);

    // Assert: no more than 100KB allocated (with 50KB tolerance for GC fluctuation)
    expect(allocatedKB).toBeLessThan(100);
  });
});

describe('Timeline System Allocation', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  bench('Timeline system allocation - 500 entities', () => {
    // Create 500 entities with varying timelines
    for (let i = 0; i < 500; i++) {
      const entity = world.entity();
      entity.add('MotionState', {
        status: 1,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
      });

      // Create tracks with multiple keyframes
      const data = new Map();
      data.set('x', [
        { startTime: 0, time: 100, startValue: 0, endValue: 100 },
        { startTime: 100, time: 200, startValue: 100, endValue: 200 },
      ]);
      entity.add('Timeline', { data, duration: 200 });
    }

    const initialHeap = process.memoryUsage().heapUsed;

    // Run timeline system 1000 times
    for (let i = 0; i < 1000; i++) {
      world.step(16);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const allocatedKB = (finalHeap - initialHeap) / 1024;

    console.log(`Timeline system allocated: ${allocatedKB.toFixed(2)}KB`);
    expect(allocatedKB).toBeLessThan(50);
  });
});

describe('Interpolation System Allocation', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  bench('Interpolation system allocation - 1000 entities', () => {
    // Create 1000 entities with interpolation components
    for (let i = 0; i < 1000; i++) {
      const entity = world.entity();
      entity.add('MotionState', {
        status: 1,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
      });

      const data = new Map();
      data.set('value', [{ startTime: 0, time: 100, startValue: 0, endValue: 100 }]);
      entity.add('Timeline', { data, duration: 100 });

      entity.add('Render', {
        rendererId: 'primitive',
        target: { value: 0 },
        props: {},
      });
    }

    const initialHeap = process.memoryUsage().heapUsed;

    // Run interpolation 1000 times
    for (let i = 0; i < 1000; i++) {
      world.step(16);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const allocatedKB = (finalHeap - initialHeap) / 1024;

    console.log(`Interpolation system allocated: ${allocatedKB.toFixed(2)}KB`);
    expect(allocatedKB).toBeLessThan(50);
  });
});

describe('Batch Sampling Allocation', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  bench('Batch sampling allocation - 2000 entities', () => {
    // Create 2000 entities for batch processing
    for (let i = 0; i < 2000; i++) {
      const entity = world.entity();
      entity.add('MotionState', {
        status: 1,
        startTime: 0,
        currentTime: 0,
        playbackRate: 1,
      });

      const data = new Map();
      data.set('x', [{ startTime: 0, time: 100, startValue: 0, endValue: 100 }]);
      entity.add('Timeline', { data, duration: 100 });
    }

    const initialHeap = process.memoryUsage().heapUsed;

    // Run batch sampling 500 times
    for (let i = 0; i < 500; i++) {
      world.step(16);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const allocatedKB = (finalHeap - initialHeap) / 1024;

    console.log(`Batch sampling allocated: ${allocatedKB.toFixed(2)}KB`);
    expect(allocatedKB).toBeLessThan(100);
  });

  // Note: Motion API allocation benchmark removed to avoid cross-package dependency in core benches.
});
