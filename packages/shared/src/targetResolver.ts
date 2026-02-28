export type DomTargetResolverContext = {
  root: Element | Document | null | undefined;
} & Record<string, unknown>;

export type DomResolvedTarget<TType> = {
  target: Element;
  type: TType;
};

export type DomTargetResolver<TType> = (
  input: unknown,
  ctx: DomTargetResolverContext,
) => DomResolvedTarget<TType>[] | null;

export function hasDomWithQuerySelectorAll(): boolean {
  return (
    typeof document !== 'undefined' && typeof (document as any).querySelectorAll === 'function'
  );
}

export function resolveDomElements(input: unknown, root: Element | Document): Element[] | null {
  if (typeof input === 'string') {
    const nodeList = (root as Document | Element).querySelectorAll(input);
    const list: Element[] = [];
    for (let i = 0; i < nodeList.length; i++) {
      const el = nodeList.item(i);
      if (el) list.push(el);
    }
    if (list.length === 0) {
      return null;
    }
    return list;
  }

  if (typeof Element === 'undefined') {
    return null;
  }

  if (input instanceof Element) {
    return [input];
  }

  if (typeof NodeList !== 'undefined' && input instanceof NodeList) {
    const list: Element[] = [];
    for (let i = 0; i < input.length; i++) {
      const el = input.item(i);
      if (el && el instanceof Element) {
        list.push(el);
      }
    }
    return list.length > 0 ? list : null;
  }

  if (typeof HTMLCollection !== 'undefined' && input instanceof HTMLCollection) {
    const list: Element[] = [];
    for (let i = 0; i < input.length; i++) {
      const node = input.item(i);
      if (node && node instanceof Element) {
        list.push(node);
      }
    }
    return list.length > 0 ? list : null;
  }

  if (Array.isArray(input) && input.length > 0) {
    const list: Element[] = [];
    for (const item of input) {
      if (item instanceof Element) {
        list.push(item);
      } else {
        return null;
      }
    }
    return list.length > 0 ? list : null;
  }

  return null;
}

export function createDomTargetResolver<TType>(domType: TType): DomTargetResolver<TType> {
  return (input: unknown, ctx: DomTargetResolverContext) => {
    const hasDOM = hasDomWithQuerySelectorAll();

    if (!hasDOM) {
      return null;
    }

    const root = ctx.root ?? document;
    if (!root) return null;

    let elements: Element[] | null = null;
    try {
      elements = resolveDomElements(input, root as Element | Document);
    } catch {
      return null;
    }

    if (!elements || elements.length === 0) {
      return null;
    }

    return elements.map((el) => ({ target: el, type: domType }));
  };
}
