import { describe, it, expect, beforeAll } from 'vitest';
import { World } from '../src/index';

describe('Core Placeholder', () => {
  beforeAll(() => {
    global.requestAnimationFrame = (cb) => setTimeout(cb, 16) as unknown as number;
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  it('initializes world', () => {
    const world = World.get();
    expect(world).toBeDefined();
  });
});
