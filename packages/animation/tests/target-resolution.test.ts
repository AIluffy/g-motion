import { describe, it, expect, beforeAll } from 'vitest';
import { resolveTargets, TargetType } from '../src/api/mark';
import { inspectTargets } from '../src/index';
import { getOrCreateVisualTarget } from '../src/api/visualTarget';

describe('resolveTargets', () => {
  beforeAll(() => {
    if (typeof (global as any).document === 'undefined') {
      (global as any).document = {};
    }
    if (typeof (global as any).HTMLElement === 'undefined') {
      (global as any).HTMLElement = class {
        id: any;
        constructor(id?: any) {
          this.id = id;
        }
      };
    }
    if (typeof (global as any).NodeList === 'undefined') {
      (global as any).NodeList = class {};
    }
    if (typeof (global as any).HTMLCollection === 'undefined') {
      (global as any).HTMLCollection = class {};
    }
  });

  it('resolves primitive target', () => {
    const targets = resolveTargets(1);
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe(TargetType.Primitive);
  });

  it('resolves dom selector with multiple matches to elements', () => {
    const root = {
      querySelectorAll: (sel: string) => {
        if (sel === '.multi') {
          return {
            length: 2,
            item: () => (global as any).document.createElement('div'),
          };
        }
        return {
          length: 0,
          item: () => null,
        };
      },
    } as any;
    const targets = resolveTargets('.multi', {
      root,
    });
    expect(targets).toHaveLength(2);
    for (const t of targets) {
      expect(t.type).toBe(TargetType.DOM);
    }
  });

  it('keeps selector as string when no or single match', () => {
    const root = {
      querySelectorAll: () => ({
        length: 0,
        item: () => null,
      }),
    } as any;
    const targets = resolveTargets('.single', {
      root,
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].target).toBe('.single');
    expect(targets[0].type).toBe(TargetType.DOM);
  });

  it('flattens nested arrays and deduplicates', () => {
    const shared = {};
    const targets = resolveTargets([shared, [shared, 2]]);
    expect(targets.length).toBe(2);
    const kinds = targets.map((t) => t.type).sort();
    expect(kinds).toEqual([TargetType.Object, TargetType.Primitive]);
  });

  it('resolves NodeList-like input into individual entries', () => {
    const list = {
      length: 2,
      item: (index: number) => (index === 0 ? { id: 'a' } : { id: 'b' }),
    } as any;
    Object.setPrototypeOf(list, (global as any).NodeList.prototype);
    const targets = resolveTargets(list);
    expect(targets.length).toBe(2);
  });

  it('resolves HTMLCollection-like input into individual entries', () => {
    const collection = {
      length: 2,
      item: (index: number) => (index === 0 ? { id: 'c' } : { id: 'd' }),
    } as any;
    Object.setPrototypeOf(collection, (global as any).HTMLCollection.prototype);
    const targets = resolveTargets(collection);
    expect(targets.length).toBe(2);
  });

  it('handles mixed arrays of selectors and objects with deduplication', () => {
    const root = {
      querySelectorAll: (sel: string) => {
        if (sel === '.multi') {
          return {
            length: 2,
            item: () => (global as any).document.createElement('div'),
          };
        }
        return {
          length: 0,
          item: () => null,
        };
      },
    } as any;
    const shared = { id: 99 };
    const targets = resolveTargets(['.multi', shared, ['.multi', shared]], {
      root,
    });
    const uniqueTargets = new Set(targets.map((t) => t.target));
    expect(uniqueTargets.size).toBe(targets.length);
  });

  it('inspects targets and reports types', () => {
    const input = [1, { id: 1 }];
    const result = inspectTargets(input);
    expect(result.targets.length).toBe(2);
    const types = result.targets.map((t) => t.type).sort();
    expect(types).toEqual([TargetType.Object, TargetType.Primitive]);
    expect(result.env.hasDocument).toBe(true);
  });

  it('reports VisualTarget cache reuse for objects', () => {
    const target = { value: 0 };
    const first = inspectTargets(target);
    expect(first.targets.length).toBe(1);
    expect(first.targets[0].isVisualTargetCached).toBe(false);

    getOrCreateVisualTarget(target, TargetType.Object);

    const second = inspectTargets(target);
    expect(second.targets.length).toBe(1);
    expect(second.targets[0].isVisualTargetCached).toBe(true);
  });

  it('handles selector input when document is missing', () => {
    const originalDocument = (global as any).document;
    (global as any).document = undefined;
    const result = inspectTargets('.missing');
    expect(result.targets.length).toBe(0);
    (global as any).document = originalDocument;
  });
});
