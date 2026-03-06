import { afterEach, describe, expect, it } from 'vitest';

import { ensureAnimationRuntime, resetAnimationRuntimeForTests } from '../src/runtime/bootstrap';

afterEach(() => {
  resetAnimationRuntimeForTests();
});

describe('animation runtime bootstrap', () => {
  it('registers required components, systems, and DOM rendering once', () => {
    const first = ensureAnimationRuntime();
    const second = ensureAnimationRuntime();

    expect(second.engine).toBe(first.engine);
    expect(second.world).toBe(first.world);

    expect(first.world.registry.has('MotionState')).toBe(true);
    expect(first.world.registry.has('Timeline')).toBe(true);
    expect(first.world.registry.has('Render')).toBe(true);
    expect(first.world.registry.has('AnimationBinding')).toBe(true);

    expect(first.engine.app.getRenderer('dom')).toBeDefined();
    expect(first.engine.app.getRenderer('object')).toBeDefined();
  });
});
