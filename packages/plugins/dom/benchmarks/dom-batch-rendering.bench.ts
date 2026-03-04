import { describe, bench, beforeEach } from 'vitest';
import { createDOMRenderer } from '../src/render/renderer';

describe('DOM Batch Rendering Performance', () => {
  let elements: HTMLElement[];
  let renderer: ReturnType<typeof createDOMRenderer>;

  beforeEach(() => {
    // Setup DOM elements
    if (typeof document !== 'undefined') {
      const container = document.createElement('div');
      container.id = 'bench-container';
      document.body.appendChild(container);

      elements = Array.from({ length: 1000 }, (_, i) => {
        const el = document.createElement('div');
        el.id = `bench-element-${i}`;
        el.className = 'bench-element';
        container.appendChild(el);
        return el;
      });
    } else {
      // Mock for non-browser environments
      elements = Array.from({ length: 1000 }, (_, i) => {
        const el = {
          id: `bench-element-${i}`,
          style: {} as any,
        } as HTMLElement;
        return el;
      });
    }

    renderer = createDOMRenderer();
  });

  bench('Individual updates (old approach)', () => {
    // Simulate old approach: direct DOM updates without batching
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const x = Math.sin(i * 0.1) * 100;
      const y = Math.cos(i * 0.1) * 100;
      const rotate = i * 0.5;

      // Direct DOM update (triggers immediate style recalc)
      el.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg)`;
    }
  });

  bench('Batched updates via RAF (new approach)', () => {
    // Simulate new approach: collect updates and apply via RAF
    renderer.preFrame?.();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const x = Math.sin(i * 0.1) * 100;
      const y = Math.cos(i * 0.1) * 100;
      const rotate = i * 0.5;

      // Mock component data
      const components = {
        Render: { props: {} },
        Transform: { x, y, rotate },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    // Apply batched updates
    renderer.postFrame?.();
  });

  bench('Batched updates with style changes', () => {
    renderer.preFrame?.();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const x = Math.sin(i * 0.1) * 100;
      const y = Math.cos(i * 0.1) * 100;
      const opacity = 0.5 + Math.sin(i * 0.05) * 0.5;

      const components = {
        Render: { props: { opacity } },
        Transform: { x, y },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('Small batch (100 elements)', () => {
    renderer.preFrame?.();

    for (let i = 0; i < 100; i++) {
      const el = elements[i];
      const x = Math.sin(i * 0.1) * 100;
      const y = Math.cos(i * 0.1) * 100;

      const components = {
        Render: { props: {} },
        Transform: { x, y },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('Large batch (5000 elements) - stress test', () => {
    // Extend elements array for stress test
    const largeElements = [...elements];
    for (let i = elements.length; i < 5000; i++) {
      if (typeof document !== 'undefined') {
        const el = document.createElement('div');
        el.id = `stress-element-${i}`;
        largeElements.push(el);
      } else {
        largeElements.push({
          id: `stress-element-${i}`,
          style: {} as any,
        } as HTMLElement);
      }
    }

    renderer.preFrame?.();

    for (let i = 0; i < largeElements.length; i++) {
      const el = largeElements[i];
      const x = Math.sin(i * 0.01) * 200;
      const y = Math.cos(i * 0.01) * 200;
      const rotate = i * 0.1;
      const scale = 1 + Math.sin(i * 0.02) * 0.2;

      const components = {
        Render: { props: {} },
        Transform: { x, y, rotate, scaleX: scale, scaleY: scale },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('Transform-only updates (no style props)', () => {
    renderer.preFrame?.();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const x = i * 2;
      const y = i;

      const components = {
        Render: { props: {} },
        Transform: { x, y },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('Complex transform with 3D', () => {
    renderer.preFrame?.();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const x = Math.sin(i * 0.1) * 100;
      const y = Math.cos(i * 0.1) * 100;
      const z = Math.sin(i * 0.05) * 50;
      const rotateX = i * 0.3;
      const rotateY = i * 0.2;
      const rotateZ = i * 0.5;

      const components = {
        Render: { props: {} },
        Transform: { x, y, z, rotateX, rotateY, rotateZ },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('Mixed updates (transforms + multiple style props)', () => {
    renderer.preFrame?.();

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const x = Math.sin(i * 0.1) * 100;
      const y = Math.cos(i * 0.1) * 100;
      const opacity = 0.5 + Math.sin(i * 0.05) * 0.5;
      const backgroundColor = `hsl(${i % 360}, 70%, 50%)`;

      const components = {
        Render: { props: { opacity, backgroundColor } },
        Transform: { x, y },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('60fps simulation (1000 elements × 60 frames)', () => {
    for (let frame = 0; frame < 60; frame++) {
      renderer.preFrame?.();

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const t = frame * 0.016; // 16ms per frame
        const x = Math.sin(i * 0.1 + t) * 100;
        const y = Math.cos(i * 0.1 + t) * 100;

        const components = {
          Render: { props: {} },
          Transform: { x, y },
        };

        const getComponent = (name: string) => components[name as keyof typeof components];

        renderer.updateWithAccessor?.(i, el, getComponent);
      }

      renderer.postFrame?.();
    }
  });

  bench('Cache hit scenario (unchanged values)', () => {
    // First pass: set initial values
    renderer.preFrame?.();
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const components = {
        Render: { props: {} },
        Transform: { x: 100, y: 50 },
      };
      const getComponent = (name: string) => components[name as keyof typeof components];
      renderer.updateWithAccessor?.(i, el, getComponent);
    }
    renderer.postFrame?.();

    // Second pass: same values (should be cached and skipped)
    renderer.preFrame?.();
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const components = {
        Render: { props: {} },
        Transform: { x: 100, y: 50 }, // Same values
      };
      const getComponent = (name: string) => components[name as keyof typeof components];
      renderer.updateWithAccessor?.(i, el, getComponent);
    }
    renderer.postFrame?.();
  });
});

describe('DOM Batch Rendering - Memory Allocation', () => {
  bench('Allocation test: 1000 iterations', () => {
    const renderer = createDOMRenderer();
    const mockElement = {
      style: {} as any,
    } as HTMLElement;

    for (let i = 0; i < 1000; i++) {
      renderer.preFrame?.();

      const components = {
        Render: { props: {} },
        Transform: { x: i, y: i * 2 },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(0, mockElement, getComponent);
      renderer.postFrame?.();
    }
  });
});

describe('DOM Batch Rendering - Real-world Scenarios', () => {
  bench('Particle system (1000 particles, random motion)', () => {
    const renderer = createDOMRenderer();
    const particles: HTMLElement[] = Array.from({ length: 1000 }, (_, i) => {
      if (typeof document !== 'undefined') {
        const el = document.createElement('div');
        el.className = 'particle';
        return el;
      }
      return { style: {} } as HTMLElement;
    });

    renderer.preFrame?.();

    for (let i = 0; i < particles.length; i++) {
      const el = particles[i];
      const x = Math.random() * 1000;
      const y = Math.random() * 1000;
      const scale = Math.random() * 2;
      const opacity = Math.random();

      const components = {
        Render: { props: { opacity } },
        Transform: { x, y, scaleX: scale, scaleY: scale },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('Carousel animation (100 cards, smooth transition)', () => {
    const renderer = createDOMRenderer();
    const cards: HTMLElement[] = Array.from({ length: 100 }, (_, i) => {
      if (typeof document !== 'undefined') {
        const el = document.createElement('div');
        el.className = 'card';
        return el;
      }
      return { style: {} } as HTMLElement;
    });

    renderer.preFrame?.();

    const offset = Date.now() * 0.001;
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      const angle = (i / cards.length) * Math.PI * 2 + offset;
      const radius = 500;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const rotateY = (angle * 180) / Math.PI;

      const components = {
        Render: { props: {} },
        Transform: { x, z, rotateY },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });

  bench('Dashboard widgets (50 widgets, complex updates)', () => {
    const renderer = createDOMRenderer();
    const widgets: HTMLElement[] = Array.from({ length: 50 }, (_, i) => {
      if (typeof document !== 'undefined') {
        const el = document.createElement('div');
        el.className = 'widget';
        return el;
      }
      return { style: {} } as HTMLElement;
    });

    renderer.preFrame?.();

    for (let i = 0; i < widgets.length; i++) {
      const el = widgets[i];
      const x = (i % 10) * 200;
      const y = Math.floor(i / 10) * 150;
      const scale = 1 + Math.sin(Date.now() * 0.001 + i) * 0.1;
      const opacity = 0.8 + Math.sin(Date.now() * 0.002 + i) * 0.2;

      const components = {
        Render: { props: { opacity } },
        Transform: { x, y, scaleX: scale, scaleY: scale },
      };

      const getComponent = (name: string) => components[name as keyof typeof components];

      renderer.updateWithAccessor?.(i, el, getComponent);
    }

    renderer.postFrame?.();
  });
});
