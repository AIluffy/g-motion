import { describe, it, expect, beforeEach } from 'vitest';
import { createDomTargetResolver } from '../src';

describe('createDomTargetResolver', () => {
  beforeEach(() => {
    delete (global as any).document;
  });

  it('returns null when DOM is not available', () => {
    const resolver = createDomTargetResolver('dom');
    const result = resolver('.selector', { root: null } as any);
    expect(result).toBeNull();
  });

  it('resolves selector strings to elements', () => {
    const el1 = { id: 'a' } as any as Element;
    const el2 = { id: 'b' } as any as Element;

    (global as any).document = {
      querySelectorAll: (sel: string) =>
        sel === '.m'
          ? {
              length: 2,
              item: (index: number) => (index === 0 ? el1 : el2),
            }
          : {
              length: 0,
              item: () => null,
            },
    };

    const resolver = createDomTargetResolver('dom');
    const result = resolver('.m', { root: (global as any).document } as any);

    expect(result).not.toBeNull();
    expect(result && result.length).toBe(2);
    expect(result && result[0].target).toBe(el1);
    expect(result && result[1].target).toBe(el2);
    expect(result && result[0].type).toBe('dom');
  });

  it('resolves single Element input', () => {
    class TestElement {}
    (global as any).Element = TestElement;

    const el = new TestElement() as any as Element;
    (global as any).document = {
      querySelectorAll: () => ({ length: 0, item: () => null }),
    };

    const resolver = createDomTargetResolver('dom');
    const result = resolver(el, { root: (global as any).document } as any);

    expect(result).not.toBeNull();
    expect(result && result.length).toBe(1);
    expect(result && result[0].target).toBe(el);
  });

  it('resolves arrays of Elements', () => {
    class TestElement {}
    (global as any).Element = TestElement;

    const el1 = new TestElement() as any as Element;
    const el2 = new TestElement() as any as Element;
    (global as any).document = {
      querySelectorAll: () => ({ length: 0, item: () => null }),
    };

    const resolver = createDomTargetResolver('dom');
    const result = resolver([el1, el2], { root: (global as any).document } as any);

    expect(result).not.toBeNull();
    expect(result && result.length).toBe(2);
    expect(result && result[0].target).toBe(el1);
    expect(result && result[1].target).toBe(el2);
  });
});
