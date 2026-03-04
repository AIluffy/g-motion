import { describe, it, expect, beforeEach } from 'vitest';
import { createDOMRenderer } from '../src/render/renderer';

describe('DOM renderer selector cache', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = '<div id="box"></div>';
    document.body.appendChild(container);
  });

  it('clears cache on DOM mutation', () => {
    const renderer = createDOMRenderer();
    const comps = {
      Render: { rendererId: 'dom', target: '#box', props: {} },
      Transform: { x: 10, y: 20 },
    } as any;

    renderer.preFrame?.();
    renderer.update(1, '#box', comps);
    renderer.postFrame?.();
    const el1 = document.querySelector('#box') as HTMLElement;
    expect(el1.style.transform).toContain('translate');

    // Remove node to simulate DOM mutation
    el1.remove();

    // Insert a new node with same selector
    const newEl = document.createElement('div');
    newEl.id = 'box';
    container.appendChild(newEl);

    renderer.preFrame?.();
    renderer.update(1, '#box', comps);
    renderer.postFrame?.();
    const el2 = document.querySelector('#box') as HTMLElement;
    expect(el2.style.transform).toContain('translate');
  });
});
