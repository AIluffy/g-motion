/**
 * WebGPU Debug Utilities
 *
 * Debug helpers for GPU compute I/O visualization and preview.
 * Kept separate to avoid polluting internal pass modules.
 */

import { createDebugger } from '@g-motion/utils';

const debugIO = createDebugger('WebGPU IO');

export { debugIO };

export function float32Preview(values: Float32Array, max: number): number[] {
  const n = Math.max(0, Math.min(values.length, max));
  return Array.from(values.subarray(0, n));
}

export function firstEntityChannelPreview(
  values: Float32Array,
  stride: number,
  channels?: Array<{ index: number; property: string }>,
  maxChannels = 12,
): Record<string, number> {
  const out: Record<string, number> = {};
  const s = Math.max(1, stride | 0);
  const count = Math.min(s, maxChannels);
  for (let i = 0; i < count; i++) {
    const prop = channels?.[i]?.property ?? `ch${i}`;
    out[prop] = values[i] ?? 0;
  }
  return out;
}
