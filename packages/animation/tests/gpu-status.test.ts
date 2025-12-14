import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setGPUMetricsProvider,
  __resetGPUMetricsProviderForTests,
  GPUBatchStatus,
  GPUBatchMetric,
} from '@g-motion/core';
import {
  getGPUBatchStatus,
  getGPUMetrics,
  getLatestGPUMetric,
  clearGPUMetrics,
} from '../src/api/gpu-status';

const status: GPUBatchStatus = {
  enabled: true,
  activeEntityCount: 42,
  threshold: 1000,
  webgpuAvailable: true,
  gpuInitialized: true,
};

const metrics: GPUBatchMetric[] = [
  { batchId: 'a', entityCount: 1, timestamp: 1, gpu: false },
  { batchId: 'b', entityCount: 2, timestamp: 2, gpu: true },
];

describe('gpu-status adapter', () => {
  beforeEach(() => {
    __resetGPUMetricsProviderForTests();
  });

  it('reads status from provider and preserves webgpuAvailable', () => {
    const provider = {
      getStatus: vi.fn(() => status),
      updateStatus: vi.fn(),
      recordMetric: vi.fn(),
      getMetrics: vi.fn(() => []),
      clear: vi.fn(),
      seedFromLegacy: vi.fn(),
    };
    setGPUMetricsProvider(provider as any);

    expect(getGPUBatchStatus()).toEqual(status);
    expect(provider.getStatus).toHaveBeenCalled();
  });

  it('returns metrics in provider order and exposes latest metric', () => {
    const provider = {
      getStatus: vi.fn(() => status),
      updateStatus: vi.fn(),
      recordMetric: vi.fn(),
      getMetrics: vi.fn(() => metrics),
      clear: vi.fn(),
      seedFromLegacy: vi.fn(),
    };
    setGPUMetricsProvider(provider as any);

    expect(getGPUMetrics()).toEqual(metrics);
    expect(getLatestGPUMetric()).toEqual(metrics[0]);
  });

  it('clears metrics via provider', () => {
    const provider = {
      getStatus: vi.fn(() => status),
      updateStatus: vi.fn(),
      recordMetric: vi.fn(),
      getMetrics: vi.fn(() => metrics),
      clear: vi.fn(),
      seedFromLegacy: vi.fn(),
    };
    setGPUMetricsProvider(provider as any);

    clearGPUMetrics();
    expect(provider.clear).toHaveBeenCalled();
  });
});
