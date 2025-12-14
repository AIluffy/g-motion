import { describe, bench } from 'vitest';

describe('DOM Renderer Optimization Performance', () => {
  // Simulate DOM elements
  const createMockElement = (id: string) => ({
    id,
    style: {
      transform: '',
      x: 0,
      y: 0,
      opacity: 1,
    },
    classList: {
      add: () => {},
      remove: () => {},
    },
  });

  // Old implementation: querySelector every time
  const resolveElementOld = (selector: string) => {
    // Simulate document.querySelector call
    // In real DOM, this traverses the DOM tree
    let _depth = 0;
    for (let i = 0; i < selector.length; i++) {
      _depth++; // Simulate DOM traversal cost
    }
    return createMockElement(selector);
  };

  // New implementation: cached lookup
  const selectorCache = new Map<string, any>();
  const resolveElementCached = (selector: string) => {
    if (selectorCache.has(selector)) {
      return selectorCache.get(selector);
    }
    const el = createMockElement(selector);
    selectorCache.set(selector, el);
    return el;
  };

  // Old transform building: string concatenation
  const buildTransformStringOld = (
    tx?: number,
    ty?: number,
    rotate?: number,
    sx?: number,
    sy?: number,
  ): string => {
    let transformStr = '';
    const tx_val = tx ?? 0;
    const ty_val = ty ?? 0;
    const rotate_val = rotate ?? 0;
    const sx_val = sx ?? 1;
    const sy_val = sy ?? 1;

    if (tx_val !== undefined || ty_val !== undefined) {
      transformStr += `translate(${tx_val}px, ${ty_val}px) `;
    }
    if (rotate_val !== undefined && rotate_val !== 0) {
      transformStr += `rotate(${rotate_val}deg) `;
    }
    if (sx_val !== 1 || sy_val !== 1) {
      transformStr += `scale(${sx_val}, ${sy_val}) `;
    }

    return transformStr.trim();
  };

  // New transform building: optimized
  const buildTransformStringNew = (
    tx?: number,
    ty?: number,
    rotate?: number,
    sx?: number,
    sy?: number,
  ): string => {
    const parts: string[] = [];

    if ((tx ?? 0) !== 0 || (ty ?? 0) !== 0) {
      parts.push(`translate(${tx ?? 0}px,${ty ?? 0}px)`);
    }

    if ((rotate ?? 0) !== 0) {
      parts.push(`rotate(${rotate ?? 0}deg)`);
    }

    if ((sx ?? 1) !== 1 || (sy ?? 1) !== 1) {
      parts.push(`scale(${sx ?? 1},${sy ?? 1})`);
    }

    return parts.join(' ');
  };

  bench('DOM element caching (optimized)', () => {
    selectorCache.clear();

    // Simulate 1000 elements with 60 frames of animation
    for (let frame = 0; frame < 60; frame++) {
      for (let i = 0; i < 1000; i++) {
        const selector = `#entity-${i}`;
        const el = resolveElementCached(selector);
        // Apply transform
        el.style.transform = `translate(${i * 0.1}px, ${i * 0.2}px)`;
      }
    }
  });

  bench('DOM element lookup without caching (baseline - old behavior)', () => {
    // Simulate 1000 elements with 60 frames of animation
    // WITHOUT caching - querySelector called every time
    for (let frame = 0; frame < 60; frame++) {
      for (let i = 0; i < 1000; i++) {
        const selector = `#entity-${i}`;
        const el = resolveElementOld(selector);
        // Apply transform
        el.style.transform = `translate(${i * 0.1}px, ${i * 0.2}px)`;
      }
    }
  });

  bench('Transform string building (optimized)', () => {
    for (let i = 0; i < 60000; i++) {
      buildTransformStringNew(
        Math.random() * 100,
        Math.random() * 100,
        Math.random() * 360,
        0.5 + Math.random() * 1.5,
        0.5 + Math.random() * 1.5,
      );
    }
  });

  bench('Transform string building (baseline - old with concatenation)', () => {
    for (let i = 0; i < 60000; i++) {
      buildTransformStringOld(
        Math.random() * 100,
        Math.random() * 100,
        Math.random() * 360,
        0.5 + Math.random() * 1.5,
        0.5 + Math.random() * 1.5,
      );
    }
  });

  bench('Full render cycle (cached elements + optimized transforms)', () => {
    selectorCache.clear();

    interface Component {
      Transform?: { x: number; y: number; rotate: number; scaleX: number; scaleY: number };
      Render?: { target: string };
    }

    // Simulate 500 entities over 60 frames
    const entities: Component[] = Array.from({ length: 500 }, (_, i) => ({
      Transform: {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        rotate: Math.random() * 360,
        scaleX: 0.8 + Math.random() * 0.4,
        scaleY: 0.8 + Math.random() * 0.4,
      },
      Render: { target: `#entity-${i}` },
    }));

    for (let frame = 0; frame < 60; frame++) {
      for (const entity of entities) {
        if (!entity.Render || !entity.Transform) continue;

        const el = resolveElementCached(entity.Render.target);
        const transform = entity.Transform;

        const transformStr = buildTransformStringNew(
          transform.x,
          transform.y,
          transform.rotate,
          transform.scaleX,
          transform.scaleY,
        );

        el.style.transform = transformStr;
      }
    }
  });

  bench('Full render cycle (uncached elements + old transforms)', () => {
    selectorCache.clear();

    interface Component {
      Transform?: { x: number; y: number; rotate: number; scaleX: number; scaleY: number };
      Render?: { target: string };
    }

    // Simulate 500 entities over 60 frames
    const entities: Component[] = Array.from({ length: 500 }, (_, i) => ({
      Transform: {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        rotate: Math.random() * 360,
        scaleX: 0.8 + Math.random() * 0.4,
        scaleY: 0.8 + Math.random() * 0.4,
      },
      Render: { target: `#entity-${i}` },
    }));

    for (let frame = 0; frame < 60; frame++) {
      for (const entity of entities) {
        if (!entity.Render || !entity.Transform) continue;

        // Simulate querySelectorAll + uncached lookup
        const el = resolveElementOld(entity.Render.target);
        const transform = entity.Transform;

        const transformStr = buildTransformStringOld(
          transform.x,
          transform.y,
          transform.rotate,
          transform.scaleX,
          transform.scaleY,
        );

        el.style.transform = transformStr;
      }
    }
  });

  bench('Selector cache hit rate stress test (repeat selectors)', () => {
    selectorCache.clear();

    // Simulate repeated animations on same elements
    const selectors = Array.from({ length: 100 }, (_, i) => `#entity-${i % 10}`);

    for (let i = 0; i < 10000; i++) {
      const selector = selectors[Math.floor(Math.random() * selectors.length)];
      resolveElementCached(selector);
    }
  });

  bench('Component buffer caching benefit', () => {
    interface Archetype {
      components: Map<string, any>;
    }

    // Old: lookup buffers multiple times per entity
    const oldApproach = (archetype: Archetype) => {
      for (let i = 0; i < 1000; i++) {
        archetype.components.get('Render');
        archetype.components.get('Transform');
        archetype.components.get('MotionState');
      }
    };

    // New: cache buffers once per archetype
    const newApproach = (archetype: Archetype) => {
      const renderBuffer = archetype.components.get('Render');
      const transformBuffer = archetype.components.get('Transform');
      const stateBuffer = archetype.components.get('MotionState');

      for (let i = 0; i < 1000; i++) {
        // Use cached buffers
        if (renderBuffer && transformBuffer && stateBuffer) {
          // Process
        }
      }
    };

    const archetype: Archetype = {
      components: new Map([
        ['Render', {}],
        ['Transform', {}],
        ['MotionState', {}],
      ]),
    };

    oldApproach(archetype);
    newApproach(archetype);
  });
});
