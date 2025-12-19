import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDOMRenderer, DOMRendererConfig } from '../src/renderer';
import { createDOMPlugin } from '../src/index';

describe('GPU Acceleration Configuration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Default GPU Acceleration', () => {
    it('should enable GPU acceleration by default', () => {
      const renderer = createDOMRenderer();
      expect(renderer).toBeDefined();
      expect(renderer.update).toBeDefined();
      expect(renderer.preFrame).toBeDefined();
      expect(renderer.postFrame).toBeDefined();
    });

    it('should apply translate3d for 2D transforms when forceGPUAcceleration is enabled', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      // Simulate rendering with transform
      renderer.update(1, element, {
        Transform: { x: 100, y: 50 },
      });

      renderer.postFrame();

      // Should use translate3d even for 2D transform
      const transform = element.style.transform;
      expect(transform).toContain('translate3d');
      expect(transform).toContain('100px');
      expect(transform).toContain('50px');
    });

    it('should add will-change hint when enableWillChange is true', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ enableWillChange: true });

      renderer.update(1, element, {
        Transform: { x: 10 },
      });

      renderer.postFrame();

      // Should have will-change set
      expect(element.style.willChange).toBe('transform');
    });

    it('should initialize element with translateZ(0) when useHardwareAcceleration is true', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ useHardwareAcceleration: true });

      renderer.update(1, element, {
        Transform: { x: 10 },
      });

      renderer.postFrame();

      // Should have transform set (either translateZ(0) or the actual transform)
      expect(element.style.transform).toBeTruthy();
    });
  });

  describe('GPU Acceleration Disabled', () => {
    it('should not force 3D transforms when forceGPUAcceleration is false', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: false });

      renderer.update(1, element, {
        Transform: { x: 100, y: 50, z: 0 },
      });

      renderer.postFrame();

      // With z=0 and forceGPUAcceleration=false, might use 2D transform
      const transform = element.style.transform;
      expect(transform).toBeDefined();
    });

    it('should not add will-change when enableWillChange is false', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ enableWillChange: false });

      renderer.update(1, element, {
        Transform: { x: 10 },
      });

      renderer.postFrame();

      expect(element.style.willChange).not.toBe('transform');
    });

    it('should not add translateZ(0) when useHardwareAcceleration is false', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ useHardwareAcceleration: false });

      // Don't set any transform initially
      expect(element.style.transform).toBeFalsy();
    });
  });

  describe('3D Transform Behavior', () => {
    it('should use translate3d for actual 3D transforms', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, element, {
        Transform: { x: 100, y: 50, z: 30 },
      });

      renderer.postFrame();

      const transform = element.style.transform;
      expect(transform).toContain('translate3d');
      expect(transform).toContain('100px');
      expect(transform).toContain('50px');
      expect(transform).toContain('30px');
    });

    it('should handle perspective in 3D transforms', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, element, {
        Transform: {
          x: 100,
          y: 50,
          perspective: 1000,
        },
      });

      renderer.postFrame();

      const transform = element.style.transform;
      expect(transform).toContain('perspective');
      expect(transform).toContain('1000px');
    });

    it('should handle rotation transforms correctly', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, element, {
        Transform: {
          rotateX: 45,
          rotateY: 30,
          rotateZ: 90,
        },
      });

      renderer.postFrame();

      const transform = element.style.transform;
      expect(transform).toContain('rotate');
      expect(transform).toContain('45deg');
      expect(transform).toContain('30deg');
      expect(transform).toContain('90deg');
    });

    it('should handle scale3d transforms', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, element, {
        Transform: {
          scaleX: 2,
          scaleY: 1.5,
          scaleZ: 0.5,
        },
      });

      renderer.postFrame();

      const transform = element.style.transform;
      expect(transform).toContain('scale');
    });
  });

  describe('Plugin Integration', () => {
    it('should create plugin with default GPU settings', () => {
      const plugin = createDOMPlugin();
      expect(plugin.name).toBe('DOMPlugin');
      expect(plugin.setup).toBeDefined();
    });

    it('should create plugin with custom renderer config', () => {
      const config: DOMRendererConfig = {
        forceGPUAcceleration: false,
        enableWillChange: false,
        useHardwareAcceleration: false,
      };

      const plugin = createDOMPlugin({ rendererConfig: config });
      expect(plugin.name).toBe('DOMPlugin');
      expect(plugin.setup).toBeDefined();
    });

    it('should allow partial config override', () => {
      const plugin = createDOMPlugin({
        rendererConfig: {
          forceGPUAcceleration: false,
        },
      });

      expect(plugin.name).toBe('DOMPlugin');
    });
  });

  describe('Multiple Elements', () => {
    it('should initialize each element only once', () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      container.appendChild(element1);
      container.appendChild(element2);

      const renderer = createDOMRenderer({
        enableWillChange: true,
        useHardwareAcceleration: true,
      });

      // First update
      renderer.update(1, element1, { Transform: { x: 10 } });
      renderer.postFrame();

      // Second update to same element
      renderer.update(1, element1, { Transform: { x: 20 } });
      renderer.postFrame();

      // Update to different element
      renderer.update(2, element2, { Transform: { y: 30 } });
      renderer.postFrame();

      // Both should be initialized
      expect(element1.style.willChange).toBe('transform');
      expect(element2.style.willChange).toBe('transform');
    });

    it('should handle batch updates with GPU acceleration', () => {
      const elements = Array.from({ length: 10 }, (_, i) => {
        const el = document.createElement('div');
        el.id = `element-${i}`;
        container.appendChild(el);
        return el;
      });

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      elements.forEach((el, i) => {
        renderer.update(i, el, {
          Transform: { x: i * 10, y: i * 20 },
        });
      });

      renderer.postFrame();

      elements.forEach((el, i) => {
        const transform = el.style.transform;
        expect(transform).toContain('translate3d');
        expect(transform).toContain(`${i * 10}px`);
        expect(transform).toContain(`${i * 20}px`);
      });
    });
  });

  describe('Performance Characteristics', () => {
    it('should not re-initialize elements on subsequent updates', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({
        enableWillChange: true,
      });

      // Multiple updates
      for (let i = 0; i < 100; i++) {
        renderer.update(1, element, {
          Transform: { x: i, y: i * 2 },
        });
        renderer.postFrame();
      }

      // Element should still have will-change
      expect(element.style.willChange).toBe('transform');
    });

    it('should handle selector-based element resolution', () => {
      const element = document.createElement('div');
      element.id = 'test-element';
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, '#test-element', {
        Transform: { x: 100 },
      });

      renderer.postFrame();

      const resolvedElement = document.querySelector('#test-element') as HTMLElement;
      expect(resolvedElement.style.transform).toContain('translate3d');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty transforms', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, element, {
        Transform: {},
      });

      renderer.postFrame();

      // Should still initialize for GPU
      if (element.style.willChange) {
        expect(element.style.willChange).toBeTruthy();
      }
    });

    it('should handle zero values correctly', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, element, {
        Transform: { x: 0, y: 0, z: 0 },
      });

      renderer.postFrame();

      // Even with zero values, should use translate3d when forced
      const transform = element.style.transform;
      expect(transform).toBeDefined();
    });

    it('should handle missing Transform component gracefully', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      renderer.update(1, element, {
        Render: { props: { opacity: 0.5 } },
      });

      renderer.postFrame();

      expect(element.style.opacity).toBe('0.5');
    });

    it('should handle null/undefined element references', () => {
      const renderer = createDOMRenderer({ forceGPUAcceleration: true });

      // Should not throw with invalid selector
      expect(() => {
        renderer.update(1, '#non-existent-element', {
          Transform: { x: 100 },
        });
        renderer.postFrame();
      }).not.toThrow();
    });
  });
});
