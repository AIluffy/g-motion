import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/runtime/engine';

describe('CPU-only mode', () => {
  it('creates and disposes engine without compute provider injection', () => {
    const engine = createEngine();
    expect(engine.getComputeProvider()).toBeNull();
    expect(() => engine.requireComputeProvider()).toThrowError(
      /ComputeProvider not available/,
    );

    expect(() => engine.dispose()).not.toThrow();
  });
});
