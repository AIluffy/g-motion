import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HALF_FLOAT_COMPONENTS,
  DOM_TRANSFORM_KEYS,
  EXCLUDED_STYLE_KEYS,
  GPU_CAPABLE_PROPERTIES,
  STANDARD_GPU_CHANNEL_PROPERTIES,
  TRANSFORM_KEYS,
  TRANSFORM_TYPED_KEYS,
} from '../src';

describe('transform constants (shared)', () => {
  it('includes expected transform keys', () => {
    expect(TRANSFORM_KEYS).toContain('translateX');
    expect(TRANSFORM_KEYS).toContain('rotateX');
    expect(TRANSFORM_KEYS).toContain('scaleX');
    expect(TRANSFORM_KEYS).toContain('skewX');
    expect(TRANSFORM_KEYS).toContain('perspective');
  });

  it('includes DOM transform keys with skew', () => {
    expect(DOM_TRANSFORM_KEYS).toContain('skewX');
    expect(DOM_TRANSFORM_KEYS).toContain('skewY');
  });

  it('defines GPU-capable properties with opacity', () => {
    expect(GPU_CAPABLE_PROPERTIES).toContain('opacity');
    expect(GPU_CAPABLE_PROPERTIES).not.toContain('skewX');
  });

  it('defines standard GPU channel properties', () => {
    expect(STANDARD_GPU_CHANNEL_PROPERTIES).toEqual([
      'x',
      'y',
      'rotate',
      'scaleX',
      'scaleY',
      'opacity',
    ]);
  });

  it('exports default half-float components list', () => {
    expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('translateX');
    expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('scaleZ');
    expect(DEFAULT_HALF_FLOAT_COMPONENTS).toContain('opacity');
  });

  it('excludes transform style keys', () => {
    expect(EXCLUDED_STYLE_KEYS.__primitive).toBe(true);
    expect(EXCLUDED_STYLE_KEYS.transform).toBe(true);
    expect(EXCLUDED_STYLE_KEYS.translateX).toBe(true);
    expect(EXCLUDED_STYLE_KEYS.scale).toBe(true);
    expect(EXCLUDED_STYLE_KEYS.perspective).toBe(true);
  });

  it('typed keys are a subset of transform keys', () => {
    for (const key of TRANSFORM_TYPED_KEYS) {
      expect(TRANSFORM_KEYS).toContain(key);
    }
  });
});
