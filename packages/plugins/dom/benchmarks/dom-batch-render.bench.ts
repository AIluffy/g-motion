import { describe, bench, beforeEach } from 'vitest';
import { createDOMRenderer } from '../src/render/renderer';
import { JSDOM } from 'jsdom';

describe('DOM Batch Rendering Performance', () => {
  let dom: JSDOM;
  let elements: HTMLElement[];
  let renderer: any;

  beforeEach(() => {
    // Setup JSDOM environment
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document as any;
    global.HTMLElement = dom.window.HTMLElement as any;
    global.MutationObserver = dom.window.MutationObserver as any;

    // Create test elements
    elements = [];
    for (let i = 0; i < 1000; i++) {
      const el = dom.window.document.createElement('div');
      el.id = `test-${i}`;
      dom.window.document.body.appendChild(el);
      elements.push(el as any);
    }

    renderer = createDOMRenderer();
  });

  bench('Batch render 1000 elements with transforms', () => {
    renderer.preFrame?.();

    for (let i = 0; i < 1000; i++) {
      renderer.update(i, elements[i], {
        Transform: {
          x: i * 10,
          y: i * 5,
          rotate: i * 2,
          scaleX: 1 + i * 0.001,
          scaleY: 1 + i * 0.001,
        },
        Render: {
          props: {
            opacity: 1 - i * 0.0005,
          },
        },
      });
    }

    renderer.postFrame?.();
  });

  bench('Sequential render 1000 elements (without batching)', () => {
    // Simulate old behavior (direct style updates)
    for (let i = 0; i < 1000; i++) {
      const el = elements[i];
      el.style.transform = `translate(${i * 10}px, ${i * 5}px) rotate(${i * 2}deg) scale(${1 + i * 0.001})`;
      el.style.opacity = String(1 - i * 0.0005);
    }
  });

  bench('Batch vs Sequential comparison - 500 elements', () => {
    const count = 500;

    // Batch path
    renderer.preFrame?.();
    for (let i = 0; i < count; i++) {
      renderer.update(i, elements[i], {
        Transform: { x: i, y: i, rotate: i },
        Render: { props: { opacity: 1 } },
      });
    }
    renderer.postFrame?.();
  });
});
