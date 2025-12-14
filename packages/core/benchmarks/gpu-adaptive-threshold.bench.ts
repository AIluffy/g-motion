import { describe, bench, expect } from 'vitest';
import { getGPUMetricsProvider } from '../src/webgpu/metrics-provider';
import { SyncManager } from '../src/webgpu/sync-manager';

describe('GPU Adaptive Threshold Performance', () => {
  bench('Dynamic threshold calculation - baseline 1000 entities', () => {
    const provider = getGPUMetricsProvider();

    // Simulate fast frame (8ms) - should increase threshold
    provider.updateStatus({ frameTimeMs: 8 });
    const threshold1 = provider.calculateDynamicThreshold(1000, 16);
    expect(threshold1).toBeGreaterThan(1000);

    // Simulate slow frame (24ms) - should decrease threshold
    provider.updateStatus({ frameTimeMs: 24 });
    const threshold2 = provider.calculateDynamicThreshold(1000, 16);
    expect(threshold2).toBeLessThan(1000);

    // Reset
    provider.updateStatus({ frameTimeMs: 0 });
  });

  bench('SyncManager frame budget check - 500-5000 entities', () => {
    const syncManager = new SyncManager();

    // Simulate varying compute times
    for (let computeTime = 5; computeTime <= 20; computeTime += 5) {
      syncManager.recordEvent({
        type: 'compute',
        duration: computeTime,
      });

      const shouldFallback = syncManager.shouldFallbackToCPU(12);
      if (computeTime > 12) {
        expect(shouldFallback).toBe(true);
      }

      syncManager.clear();
    }
  });

  bench('Threshold adaptation under load - 1000 iterations', () => {
    const provider = getGPUMetricsProvider();
    const baselines = [500, 1000, 2000, 5000];
    const frameTimes = [8, 12, 16, 20, 24];

    for (const baseline of baselines) {
      for (const frameTime of frameTimes) {
        provider.updateStatus({ frameTimeMs: frameTime });
        const adjusted = provider.calculateDynamicThreshold(baseline, 16);

        // Verify bounds (200-5000)
        expect(adjusted).toBeGreaterThanOrEqual(200);
        expect(adjusted).toBeLessThanOrEqual(5000);
      }
    }
  });
});
