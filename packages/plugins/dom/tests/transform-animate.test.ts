import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { motion } from '@g-motion/animation';
import { app } from '@g-motion/core';
import { DOMPlugin } from '../src/index';

describe('DOM Transform Animation', () => {
  beforeAll(() => {
    // Mock requestAnimationFrame for animation engine
    global.requestAnimationFrame = (cb) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
    global.cancelAnimationFrame = (id) => clearTimeout(id);

    // Register DOM plugin once
    DOMPlugin.setup(app);
  });

  beforeEach(() => {
    // Create a test element
    document.body.innerHTML = '<div id="test-box"></div>';
  });

  it('should animate DOM element transform properties', async () => {
    const box = document.getElementById('test-box')!;
    expect(box).toBeTruthy();

    // Create animation
    const control = motion('#test-box')
      .mark([{ to: { x: 100, y: 50, scaleX: 1.2, rotate: 45 }, at: 100 }])
      .animate();

    expect(control).toBeTruthy();

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check if transform was applied
    const transform = box.style.transform;
    console.log('2D Transform result:', transform);

    expect(transform).toContain('translate');
    expect(transform).toContain('100px');
    expect(transform).toContain('50px');
    expect(transform).toContain('rotate');
    expect(transform).toContain('45deg');
    expect(transform).toContain('scale');
    expect(transform).toContain('1.2');

    control.stop();
  });

  it.skip('should animate DOM element 3D transform properties', async () => {
    const box = document.getElementById('test-box')!;
    expect(box).toBeTruthy();

    // Reset transform first
    box.style.transform = '';

    const control = motion('#test-box')
      .mark([
        {
          to: {
            x: 40,
            y: 20,
            z: 60,
            rotateX: 25,
            rotateY: -18,
            rotateZ: 12,
            scale: 1.1,
            perspective: 700,
          },
          at: 120,
        },
      ])
      .animate();

    expect(control).toBeTruthy();
    console.log('Control created:', !!control);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const transform = box.style.transform;
    console.log('3D Transform result:', transform);
    console.log('Box element:', box);
    console.log('Transform should have 3D properties');
    expect(transform).toContain('perspective');
    expect(transform).toContain('700px');
    expect(transform).toContain('translate3d');
    expect(transform).toContain('60px');
    expect(transform).toContain('rotateX');
    expect(transform).toContain('25deg');
    expect(transform).toContain('rotateY');
    expect(transform).toContain('-18deg');
    expect(transform).toContain('rotateZ');
    expect(transform).toContain('12deg');
    expect(transform).toContain('scale3d');
    expect(transform).toContain('1.1');

    control.stop();
  });
});
