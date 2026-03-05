import { describe, expect, it } from 'vitest';

describe('shared types subpath entry', () => {
  it('exposes no runtime exports', async () => {
    const mod = await import('../src/types-entry');
    expect(Object.keys(mod)).toEqual([]);
  });
});
