import { describe, it, expect } from 'vitest';
import { TRANSFORM_TYPED_KEYS, buildTransformTypedBuffers } from '../src';

describe('buildTransformTypedBuffers (shared)', () => {
  it('builds buffers from provided keys', () => {
    const calls: Array<[string, string]> = [];
    const getTypedBuffer = (component: string, field: string) => {
      calls.push([component, field]);
      if (field === 'x') return new Float32Array([1]);
      return undefined;
    };

    const result = buildTransformTypedBuffers(getTypedBuffer, ['x', 'y']);

    expect(calls).toEqual([
      ['Transform', 'x'],
      ['Transform', 'y'],
    ]);
    expect(result.x).toBeInstanceOf(Float32Array);
    expect(result.y).toBeUndefined();
  });

  it('uses default transform typed keys when not provided', () => {
    const getTypedBuffer = (_component: string, _field: string) => undefined;
    const result = buildTransformTypedBuffers(getTypedBuffer);

    expect(Object.keys(result)).toEqual([...TRANSFORM_TYPED_KEYS]);
  });
});
