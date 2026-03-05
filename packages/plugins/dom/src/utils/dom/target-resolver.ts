import { isDomElement, isNodeList } from './type-guards';

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

/**
 * DOM environment interface for dependency injection.
 * Allows tests to provide mock implementations without global pollution.
 */
export interface DomEnvironment {
  hasDocument(): boolean;
  hasWindow(): boolean;
  createElement(tag: string): Element | null;
  querySelectorAll(root: Element | Document, selector: string): NodeListLike | null;
  isElement(input: unknown): input is Element;
  isNodeList(input: unknown): input is NodeListLike;
  isHTMLCollection(input: unknown): input is NodeListLike;
}

/**
 * NodeList-like interface for abstracting DOM collections
 */
export interface NodeListLike {
  length: number;
  item(index: number): Element | null;
}

/**
 * Default browser DOM environment implementation
 */
const defaultDomEnv: DomEnvironment = {
  hasDocument(): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof (document as unknown as Record<string, unknown>).querySelectorAll === 'function'
    );
  },

  hasWindow(): boolean {
    return typeof window !== 'undefined';
  },

  createElement(tag: string): Element | null {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }
    return document.createElement(tag);
  },

  querySelectorAll(root: Element | Document, selector: string): NodeListLike | null {
    try {
      const nodeList = (root as Document | Element).querySelectorAll(selector);
      return nodeList;
    } catch {
      return null;
    }
  },

  isElement: isDomElement,

  isNodeList: isNodeList,

  isHTMLCollection(input: unknown): input is NodeListLike {
    return typeof HTMLCollection !== 'undefined' && input instanceof HTMLCollection;
  },
};

// Current DOM environment (can be replaced for testing)
let currentDomEnv: DomEnvironment = defaultDomEnv;

/**
 * Set the DOM environment (useful for testing with mock implementations).
 * Pass null to restore the default browser implementation.
 */
export function setDomEnvironment(env: DomEnvironment | null): void {
  currentDomEnv = env ?? defaultDomEnv;
}

/**
 * Get the current DOM environment.
 */
export function getDomEnvironment(): DomEnvironment {
  return currentDomEnv;
}

/**
 * Reset to the default DOM environment (useful in test cleanup).
 */
export function resetDomEnvironment(): void {
  currentDomEnv = defaultDomEnv;
}

/**
 * 从类数组集合中收集 Element 元素
 *
 * @param length - 集合长度
 * @param getItem - 获取元素的函数
 * @param strict - 如果为 true，遇到非 Element 时返回 null；如果为 false，跳过非 Element
 * @returns Element 数组或 null
 */
function collectElements(
  length: number,
  getItem: (index: number) => unknown,
  strict: boolean,
): Element[] | null {
  const list: Element[] = [];
  for (let i = 0; i < length; i++) {
    const item = getItem(i);
    if (currentDomEnv.isElement(item)) {
      list.push(item);
    } else if (strict) {
      return null;
    }
  }
  return list.length > 0 ? list : null;
}

export function resolveDomElements(input: unknown, root: Element | Document): Element[] | null {
  if (typeof input === 'string') {
    const nodeList = currentDomEnv.querySelectorAll(root, input);
    if (!nodeList) return null;
    const list: Element[] = [];
    for (let i = 0; i < nodeList.length; i++) {
      const el = nodeList.item(i);
      if (el) list.push(el);
    }
    return list.length > 0 ? list : null;
  }

  if (currentDomEnv.isElement(input)) {
    return [input];
  }

  if (currentDomEnv.isNodeList(input)) {
    return collectElements(input.length, (i: number) => input.item(i), false);
  }

  if (currentDomEnv.isHTMLCollection(input)) {
    return collectElements(input.length, (i: number) => input.item(i), false);
  }

  if (Array.isArray(input) && input.length > 0) {
    return collectElements(input.length, (i: number) => input[i], true);
  }

  return null;
}

export function createDomTargetResolver<TType>(domType: TType): DomTargetResolver<TType> {
  return (input: unknown, ctx: DomTargetResolverContext) => {
    const domEnv = getDomEnvironment();

    if (!domEnv.hasDocument()) {
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
