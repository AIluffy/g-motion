import { describe, test, expect, beforeEach, vi } from 'vitest';
import { App } from '@g-motion/core';
import { World } from '@g-motion/core';
import { motion } from '../src/api/builder';

describe('Error Validation Tests', () => {
  let app: App;
  let world: World;

  beforeEach(() => {
    world = new World();
    app = new App(world);
  });

  describe('Component Registration Validation', () => {
    test('throws on invalid component name', () => {
      expect(() => {
        app.registerComponent('', { schema: { value: 'float32' } });
      }).toThrow(/Component name must be a non-empty string/);

      expect(() => {
        app.registerComponent(null as any, { schema: { value: 'float32' } });
      }).toThrow(/Component name must be a non-empty string/);
    });

    test('throws on duplicate component registration', () => {
      app.registerComponent('TestComponent', { schema: { value: 'float32' } });

      expect(() => {
        app.registerComponent('TestComponent', { schema: { value: 'float32' } });
      }).toThrow(/Component 'TestComponent' is already registered/);
    });
  });

  describe('Renderer Registration Validation', () => {
    test('throws on invalid renderer name', () => {
      expect(() => {
        app.registerRenderer('', { update: () => {} });
      }).toThrow(/Renderer name must be a non-empty string/);
    });

    test('throws on duplicate renderer registration', () => {
      app.registerRenderer('testRenderer', { update: () => {} });

      expect(() => {
        app.registerRenderer('testRenderer', { update: () => {} });
      }).toThrow(/Renderer 'testRenderer' is already registered/);
    });

    test('throws on renderer missing update method', () => {
      expect(() => {
        app.registerRenderer('invalid', {} as any);
      }).toThrow(/Renderer 'invalid' must implement update/);

      expect(() => {
        app.registerRenderer('invalid2', { update: 'not a function' } as any);
      }).toThrow(/Renderer 'invalid2' must implement update/);
    });
  });

  describe('Mark Options Validation', () => {
    test('throws on negative duration', () => {
      expect(() => {
        motion({ value: 0 }).mark({ to: { value: 100 }, duration: -100 });
      }).toThrow(/duration must be non-negative/);
    });

    test('throws on negative time', () => {
      expect(() => {
        motion({ value: 0 }).mark({ to: { value: 100 }, at: -50 });
      }).toThrow(/time must be non-negative/);
    });

    test('throws on invalid duration type', () => {
      expect(() => {
        motion({ value: 0 }).mark({ to: { value: 100 }, duration: 'invalid' as any });
      }).toThrow(/duration must be a number/);
    });

    test('throws when neither time nor duration provided', () => {
      expect(() => {
        motion({ value: 0 }).mark({ to: { value: 100 } } as any);
      }).toThrow(/must have either 'time' \(absolute\) or 'duration' \(relative\)/);
    });

    test('warns when both time and duration provided', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      motion({ value: 0 }).mark({ to: { value: 100 }, at: 100, duration: 200 });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Motion][Validation]',
        expect.stringContaining("Using 'time', ignoring 'duration'"),
      );

      consoleWarnSpy.mockRestore();
    });

    test('throws on unsupported interp', () => {
      expect(() => {
        motion({ value: 0 }).mark({
          to: { value: 100 },
          duration: 100,
          interp: 'invalid' as any,
        });
      }).toThrow(/Unsupported interp value/);
    });

    test('throws on invalid easing type', () => {
      expect(() => {
        motion({ value: 0 }).mark({
          to: { value: 100 },
          duration: 100,
          easing: 123 as any,
        } as any);
      }).toThrow(/easing must be a function or string name/);
    });

    test('throws when both ease and easing provided', () => {
      expect(() => {
        motion({ value: 0 }).mark({
          to: { value: 100 },
          duration: 100,
          ease: 'linear',
          easing: 'easeIn',
        } as any);
      }).toThrow(/Provide either 'ease' or 'easing', not both/);
    });

    test('throws on invalid bezier control points', () => {
      expect(() => {
        motion({ value: 0 }).mark({
          to: { value: 100 },
          duration: 100,
          bezier: { cx1: 'invalid' as any, cy1: 0, cx2: 1, cy2: 1 },
        });
      }).toThrow(/Bezier control points must be numbers/);

      expect(() => {
        motion({ value: 0 }).mark({
          to: { value: 100 },
          duration: 100,
          bezier: { cx1: -0.5, cy1: 0, cx2: 1, cy2: 1 },
        });
      }).toThrow(/Bezier cx1 and cx2 must be in range \[0,1\]/);

      expect(() => {
        motion({ value: 0 }).mark({
          to: { value: 100 },
          duration: 100,
          bezier: { cx1: 0, cy1: 0, cx2: 1.5, cy2: 1 },
        });
      }).toThrow(/Bezier cx1 and cx2 must be in range \[0,1\]/);
    });

    test('throws on invalid stagger type', () => {
      expect(() => {
        motion([{ value: 0 }, { value: 0 }]).mark({
          to: { value: 100 },
          duration: 100,
          stagger: 'invalid' as any,
        });
      }).toThrow(/Stagger must be a number or function/);
    });

    test('throws on negative stagger', () => {
      expect(() => {
        motion([{ value: 0 }, { value: 0 }]).mark({
          to: { value: 100 },
          duration: 100,
          stagger: -50,
        });
      }).toThrow(/Stagger must be non-negative/);
    });
  });

  describe('Valid Mark Options', () => {
    test('accepts valid duration', () => {
      expect(() => {
        motion({ value: 0 }).mark({ to: { value: 100 }, duration: 200 });
      }).not.toThrow();
    });

    test('accepts valid time', () => {
      expect(() => {
        motion({ value: 0 }).mark({ to: { value: 100 }, at: 500 });
      }).not.toThrow();
    });

    test('accepts function stagger', () => {
      expect(() => {
        motion([{ value: 0 }, { value: 0 }]).mark({
          to: { value: 100 },
          duration: 100,
          stagger: (index) => index * 50,
        });
      }).not.toThrow();
    });

    test('accepts valid bezier control points', () => {
      expect(() => {
        motion({ value: 0 }).mark({
          to: { value: 100 },
          duration: 100,
          bezier: { cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 },
        });
      }).not.toThrow();
    });
  });
});
