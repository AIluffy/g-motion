import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import {
  getGPUMetricsProvider,
  setGPUMetricsProvider,
  __resetGPUMetricsProviderForTests,
  setGPUGlobalMetricsSyncEnabled,
} from '../src/webgpu/metrics-provider';

const legacyStatus = {
  activeCount: 5,
  threshold: 1000,
  gpuEnabled: true,
};

const legacyMetrics = [{ batchId: 'legacy-1', entityCount: 10, timestamp: 1, gpu: true }];

describe('GPUMetricsProvider', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    __resetGPUMetricsProviderForTests();
    delete (globalThis as any).__motionThresholdContext;
    delete (globalThis as any).__motionGPUMetrics;
    delete (globalThis as any).__webgpuInitialized;
    process.env.NODE_ENV = 'development';
    vi.restoreAllMocks();
  });

  it('returns a module singleton and allows injection', () => {
    const first = getGPUMetricsProvider();
    const second = getGPUMetricsProvider();
    expect(first).toBe(second);

    const custom = {
      getStatus: vi.fn(() => ({
        enabled: false,
        activeEntityCount: 0,
        threshold: 0,
        webgpuAvailable: false,
        gpuInitialized: false,
      })),
      updateStatus: vi.fn(),
      recordMetric: vi.fn(),
      getMetrics: vi.fn(() => []),
      clear: vi.fn(),
      seedFromLegacy: vi.fn(),
    };

    setGPUMetricsProvider(custom as any);
    expect(getGPUMetricsProvider()).toBe(custom);
  });

  it('merges status updates and preserves defaults', () => {
    const provider = getGPUMetricsProvider();
    expect(provider.getStatus()).toEqual({
      enabled: false,
      activeEntityCount: 0,
      threshold: 1000,
      webgpuAvailable: false,
      gpuInitialized: false,
    });

    provider.updateStatus({
      enabled: true,
      activeEntityCount: 12,
      threshold: 500,
    });

    expect(provider.getStatus()).toEqual({
      enabled: true,
      activeEntityCount: 12,
      threshold: 500,
      webgpuAvailable: false,
      gpuInitialized: false,
    });

    provider.updateStatus({ webgpuAvailable: true, gpuInitialized: true });

    expect(provider.getStatus()).toEqual({
      enabled: true,
      activeEntityCount: 12,
      threshold: 500,
      webgpuAvailable: true,
      gpuInitialized: true,
    });
  });

  it('records metrics and returns newest first', () => {
    const provider = getGPUMetricsProvider();
    setGPUGlobalMetricsSyncEnabled(false);
    provider.recordMetric({ batchId: 'a', entityCount: 1, timestamp: 1, gpu: false });
    provider.recordMetric({ batchId: 'b', entityCount: 2, timestamp: 2, gpu: true });

    expect(provider.getMetrics()).toEqual([
      { batchId: 'b', entityCount: 2, timestamp: 2, gpu: true },
      { batchId: 'a', entityCount: 1, timestamp: 1, gpu: false },
    ]);
  });

  it('records GPU memory snapshots, history, and threshold alerts', () => {
    const provider = getGPUMetricsProvider() as any;
    const now = Date.now();
    (globalThis as any).__motionGPUMemoryAlerts = [];
    provider.updateStatus({
      memoryUsageThresholdBytes: 512,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    provider.recordMemorySnapshot?.({
      bytesSkipped: 10,
      totalBytesProcessed: 100,
      currentMemoryUsage: 1024,
      peakMemoryUsage: 2048,
      timestamp: now,
    });

    const history = provider.getMemoryHistory?.() as any[];
    expect(history && history.length).toBeGreaterThan(0);
    const latest = provider.getLatestMemorySnapshot?.() as any;
    expect(latest.currentMemoryUsage).toBe(1024);
    expect(latest.peakMemoryUsage).toBe(2048);

    const status = provider.getStatus() as any;
    expect(status.memoryUsageBytes).toBe(1024);
    expect(status.peakMemoryUsageBytes).toBe(2048);
    expect(status.memoryAlertActive).toBe(true);

    const alerts = (globalThis as any).__motionGPUMemoryAlerts as any[];
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
  });

  it('seeds from legacy globals and warns once in dev', () => {
    (globalThis as any).__motionThresholdContext = legacyStatus;
    (globalThis as any).__motionGPUMetrics = legacyMetrics;
    (globalThis as any).__webgpuInitialized = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setGPUGlobalMetricsSyncEnabled(true);
    const provider = getGPUMetricsProvider();

    expect(provider.getStatus()).toEqual({
      enabled: true,
      activeEntityCount: 5,
      threshold: 1000,
      webgpuAvailable: false,
      gpuInitialized: true,
    });
    expect(provider.getMetrics()).toEqual([
      { batchId: 'legacy-1', entityCount: 10, timestamp: 1, gpu: true },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);

    // Second access should not warn again
    provider.getStatus();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });
});
