import { describe, it, expect, beforeEach } from 'vitest';
import { createDOMRenderer } from '../src/renderer';

describe('DOM renderer selector cache', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = '<div id="box"></div>';
    document.body.appendChild(container);
  });

  it('clears cache on DOM mutation', () => {
    const renderer = createDOMRenderer();
    const comps = { Render: { rendererId: 'dom', target: '#box', props: { x: 10 } } } as any;

    // First update should resolve and cache
    renderer.update(1, '#box', comps);
    const el1 = document.querySelector('#box') as HTMLElement;
    expect(el1.style.transform).toContain('translate');

    // Remove node to simulate DOM mutation
    el1.remove();

    // Insert a new node with same selector
    const newEl = document.createElement('div');
    newEl.id = 'box';
    container.appendChild(newEl);

    // Second update should re-resolve after cache clear
    renderer.update(1, '#box', comps);
    const el2 = document.querySelector('#box') as HTMLElement;
    expect(el2.style.transform).toContain('translate');
  });
});
