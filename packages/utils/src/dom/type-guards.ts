/**
 * DOM type guard utilities
 */

/**
 * Type guard for DOM Element instances
 */
export function isDomElement(value: unknown): value is Element {
  if (typeof Element === 'undefined') return false;
  return value instanceof Element;
}

/**
 * Type guard for NodeList or HTMLCollection
 */
export function isNodeList(value: unknown): value is NodeListOf<Element> | HTMLCollection {
  if (typeof NodeList !== 'undefined' && value instanceof NodeList) return true;
  if (typeof HTMLCollection !== 'undefined' && value instanceof HTMLCollection) return true;
  return false;
}

/**
 * Type guard for array-like objects (excluding actual Arrays and Strings)
 */
export function isArrayLike(
  value: unknown,
): value is { length: number } & { [index: number]: unknown } {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  if (typeof (value as any).length !== 'number') return false;
  if ((value as any) instanceof String) return false;
  return true;
}
