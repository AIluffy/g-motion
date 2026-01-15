/**
 * Utility functions for Motion engine
 */

export * from './archetype-helpers';
export * from './frame-sampler';

export function getNowMs(): number {
  const p = (globalThis as any).process as any;
  const isNode = typeof p?.versions?.node === 'string';
  if (isNode) return Date.now();
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
