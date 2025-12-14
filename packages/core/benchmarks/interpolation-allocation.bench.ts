import { describe, bench } from 'vitest';

describe('Interpolation System - render.props Allocation', () => {
  interface RenderComponent {
    rendererId: string;
    target: any;
    props?: Record<string, number>;
  }

  // Simulated entity processing
  const createRenderBuffer = (size: number) => {
    return Array.from({ length: size }, (_, i) => ({
      rendererId: 'dom',
      target: `#entity-${i}`,
    })) as RenderComponent[];
  };

  bench('Pre-allocated render.props (optimized)', () => {
    const renderBuffer = createRenderBuffer(1000);

    // Optimized: Pre-allocate once
    for (let i = 0; i < renderBuffer.length; i++) {
      if (!renderBuffer[i]) {
        renderBuffer[i] = { rendererId: 'dom', target: '', props: {} };
      }
      if (renderBuffer[i] && !renderBuffer[i].props) {
        renderBuffer[i].props = {};
      }
    }

    // Per-frame interpolation (simulated 60 frames)
    for (let frame = 0; frame < 60; frame++) {
      for (let i = 0; i < renderBuffer.length; i++) {
        const render = renderBuffer[i];
        // Just assign props without allocation
        if (render.props) {
          render.props['x'] = Math.random() * 100;
          render.props['y'] = Math.random() * 100;
          render.props['opacity'] = Math.random();
        }
      }
    }
  });

  bench('On-demand render.props allocation (baseline - old behavior)', () => {
    const renderBuffer = createRenderBuffer(1000);

    // Old behavior: allocate on-demand during interpolation
    for (let frame = 0; frame < 60; frame++) {
      for (let i = 0; i < renderBuffer.length; i++) {
        const render = renderBuffer[i];
        // This causes allocation every frame for each entity
        if (!render.props) {
          render.props = {};
        }
        render.props['x'] = Math.random() * 100;
        render.props['y'] = Math.random() * 100;
        render.props['opacity'] = Math.random();
      }
    }
  });

  bench('Object allocation stress test (1000 entities × 60 frames)', () => {
    const renderBuffer = createRenderBuffer(1000);

    // Stress: measure allocation cost across many frames
    for (let frame = 0; frame < 60; frame++) {
      for (let i = 0; i < renderBuffer.length; i++) {
        const render = renderBuffer[i];
        if (!render.props) {
          render.props = {};
        }
        // Update properties
        for (const key of Object.keys(render.props || {})) {
          (render.props as Record<string, number>)[key] = Math.random();
        }
      }
    }
  });

  bench('GC pressure comparison (repeated allocation)', () => {
    // Allocate and discard objects repeatedly
    for (let i = 0; i < 60000; i++) {
      const _allocation = {
        x: Math.random(),
        y: Math.random(),
        opacity: Math.random(),
      };
      // Use to prevent optimization
      if (_allocation.x < 0) {
        throw new Error('Unexpected');
      }
    }
  });

  bench('Pre-allocated pool (minimal allocation)', () => {
    // Pre-allocate pool of objects
    const pool = Array.from({ length: 1000 }, () => ({
      x: 0,
      y: 0,
      opacity: 0,
    }));

    // Reuse from pool
    for (let i = 0; i < 60000; i++) {
      const obj = pool[i % pool.length];
      obj.x = Math.random();
      obj.y = Math.random();
      obj.opacity = Math.random();
    }
  });
});
