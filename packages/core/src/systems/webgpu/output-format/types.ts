/**
 * Output Format Types
 */

import { OUTPUT_FORMAT, packOutputChannels } from '../../../webgpu/output-format-shader';

export { OUTPUT_FORMAT, packOutputChannels };

export type OutputFormatPoolStats = {
  acquireCount: number;
  reuseCount: number;
  createCount: number;
  releaseCount: number;
  pendingReleaseCount: number;
  availableBufferCount: number;
  activeBufferCount: number;
  bytesRequestedTotal: number;
  bytesProvidedTotal: number;
  bytesAllocatedCurrent: number;
  bytesAllocatedPeak: number;
  acquireTimeMsTotal: number;
  lastAcquireMs: number;
  averageAcquireMs: number;
  createTimeMsTotal: number;
  lastCreateMs: number;
  averageCreateMs: number;
  reuseTimeMsTotal: number;
  lastReuseMs: number;
  averageReuseMs: number;
  estimatedFragmentationRatio: number;
};

export type PooledBufferMeta = {
  device: GPUDevice;
  bucketSize: number;
  usage: number;
};

export function nextPow2(n: number): number {
  let v = Math.max(1, n | 0);
  v--;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  v++;
  return v >>> 0;
}

export function makeChannelsKey(
  channels: Array<{ sourceIndex: number; formatType: number; minValue: number; maxValue: number }>,
) {
  let key = '';
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    key += `${c.sourceIndex}|${c.formatType}|${c.minValue}|${c.maxValue};`;
  }
  return key;
}
