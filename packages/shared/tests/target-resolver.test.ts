import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDomTargetResolver,
  setDomEnvironment,
  resetDomEnvironment,
  type DomEnvironment,
  type NodeListLike,
} from '../src';

// Mock DOM environment for testing
function createMockDomEnvironment(mockDocument: unknown): DomEnvironment {
  const MockElement = class MockElement {};
  const MockNodeList = class MockNodeList {
    constructor(private items: unknown[]) {}
    get length() {
      return this.items.length;
    }
    item(index: number): Element | null {
      return (this.items[index] as Element) ?? null;
    }
  };

  return {
    hasDocument: () => true,
    querySelectorAll: (_root: Element | Document, selector: string): NodeListLike | null => {
      if (mockDocument && typeof mockDocument === 'object' && mockDocument !== null) {
        const doc = mockDocument as { querySelectorAll?: (sel: string) => unknown };
        if (typeof doc.querySelectorAll === 'function') {
          const result = doc.querySelectorAll(selector);
          if (result && typeof result === 'object' && 'length' in result && 'item' in result) {
            return result as NodeListLike;
          }
        }
      }
      return null;
    },
    isElement: (input: unknown): input is Element => input instanceof MockElement,
    isNodeList: (input: unknown): input is NodeListLike => input instanceof MockNodeList,
    isHTMLCollection: (_input: unknown): _input is NodeListLike => false,
  };
}

describe('createDomTargetResolver', () => {
  beforeEach(() => {
    resetDomEnvironment();
  });

  it('returns null when DOM is not available', () => {
    setDomEnvironment({
      hasDocument: () => false,
      querySelectorAll: () => null,
      isElement: (_input: unknown): _input is Element => false,
      isNodeList: (_input: unknown): _input is NodeListLike => false,
      isHTMLCollection: (_input: unknown): _input is NodeListLike => false,
    });
    const resolver = createDomTargetResolver('dom');
    const result = resolver('.selector', { root: null } as any);
    expect(result).toBeNull();
  });

  it('resolves selector strings to elements', () => {
    const el1 = { id: 'a' } as any as Element;
    const el2 = { id: 'b' } as any as Element;

    const mockDocument = {
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

    setDomEnvironment(createMockDomEnvironment(mockDocument));

    const resolver = createDomTargetResolver('dom');
    const result = resolver('.m', { root: mockDocument as any } as any);

    expect(result).not.toBeNull();
    expect(result && result.length).toBe(2);
    expect(result && result[0].target).toBe(el1);
    expect(result && result[1].target).toBe(el2);
    expect(result && result[0].type).toBe('dom');
  });

  it('resolves single Element input', () => {
    class TestElement {}

    const mockEnv: DomEnvironment = {
      hasDocument: () => true,
      querySelectorAll: () => ({ length: 0, item: () => null }),
      isElement: (input: unknown): input is Element => input instanceof TestElement,
      isNodeList: (_input: unknown): _input is NodeListLike => false,
      isHTMLCollection: (_input: unknown): _input is NodeListLike => false,
    };

    setDomEnvironment(mockEnv);

    const el = new TestElement() as any as Element;
    const resolver = createDomTargetResolver('dom');
    const result = resolver(el, { root: {} as any } as any);

    expect(result).not.toBeNull();
    expect(result && result.length).toBe(1);
    expect(result && result[0].target).toBe(el);
  });

  it('resolves arrays of Elements', () => {
    class TestElement {}

    const mockEnv: DomEnvironment = {
      hasDocument: () => true,
      querySelectorAll: () => ({ length: 0, item: () => null }),
      isElement: (input: unknown): input is Element => input instanceof TestElement,
      isNodeList: (_input: unknown): _input is NodeListLike => false,
      isHTMLCollection: (_input: unknown): _input is NodeListLike => false,
    };

    setDomEnvironment(mockEnv);

    const el1 = new TestElement() as any as Element;
    const el2 = new TestElement() as any as Element;
    const resolver = createDomTargetResolver('dom');
    const result = resolver([el1, el2], { root: {} as any } as any);

    expect(result).not.toBeNull();
    expect(result && result.length).toBe(2);
    expect(result && result[0].target).toBe(el1);
    expect(result && result[1].target).toBe(el2);
  });
});
