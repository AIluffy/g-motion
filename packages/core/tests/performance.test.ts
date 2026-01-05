import { describe, it, expect, beforeEach } from 'vitest';
import {
  ComputeBenchmark,
  PerformanceProfiler,
  RegressionTestHarness,
} from '../src/webgpu/benchmark';
import { SyncManager } from '../src/webgpu/sync-manager';

describe('Performance Benchmarking', () => {
  let benchmark: ComputeBenchmark;

  beforeEach(() => {
    benchmark = new ComputeBenchmark();
  });

  describe('ComputeBenchmark', () => {
    it('should run single benchmark', async () => {
      const fn = async () => {
        // Simulate work
        let _sum = 0;
        for (let i = 0; i < 1000; i++) {
          _sum += Math.sqrt(i);
        }
      };

      const result = await benchmark.benchmark('test-operation', fn, {
        iterations: 5,
        warmup: false,
      });

      expect(result).toBeDefined();
      expect(result.iterations).toBe(5);
      expect(result.avgTime).toBeGreaterThan(0);
      expect(result.minTime).toBeLessThanOrEqual(result.avgTime);
      expect(result.maxTime).toBeGreaterThanOrEqual(result.avgTime);
    });

    it('should calculate statistics correctly', async () => {
      const fn = async () => {
        // Simulate consistent operation
        let _sum = 0;
        for (let i = 0; i < 100; i++) {
          _sum += i;
        }
      };

      const result = await benchmark.benchmark('consistent-op', fn, {
        iterations: 10,
      });

      // Verify stats are calculated
      expect(result.avgTime).toBe(result.totalTime / result.iterations);
      expect(result.stdDev).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple benchmarks', async () => {
      const fn1 = async () => {
        let _sum = 0;
        for (let i = 0; i < 100; i++) {
          _sum += i;
        }
      };

      const fn2 = async () => {
        let _sum = 0;
        for (let i = 0; i < 200; i++) {
          _sum += i;
        }
      };

      await benchmark.benchmark('op1', fn1, { iterations: 3 });
      await benchmark.benchmark('op2', fn2, { iterations: 3 });

      const results1 = benchmark.getResults('op1');
      const results2 = benchmark.getResults('op2');

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
    });

    it('should generate benchmark report', async () => {
      const fn = async () => {
        let _sum = 0;
        for (let i = 0; i < 100; i++) {
          _sum += i;
        }
      };

      await benchmark.benchmark('test-op', fn, { iterations: 3 });

      const report = benchmark.generateReport('test-op');
      expect(report).toContain('test-op');
      expect(report).toContain('Avg Time');
    });

    it('should clear results', async () => {
      const fn = async () => {
        // No-op
      };

      await benchmark.benchmark('test', fn, { iterations: 1 });
      benchmark.clearResults();

      const results = benchmark.getResults('test');
      expect(results).toHaveLength(0);
    });
  });

  describe('Data Transfer Benchmarking', () => {
    it('should benchmark upload and download', async () => {
      const uploadFn = async () => {
        // Simulate upload of 1MB
        return 1024 * 1024;
      };

      const downloadFn = async () => {
        // Simulate download of 1MB
        return 1024 * 1024;
      };

      const result = await benchmark.benchmarkDataTransfer('data-transfer', uploadFn, downloadFn, {
        iterations: 3,
      });

      expect(result.upload).toBeDefined();
      expect(result.download).toBeDefined();
      expect(result.uploadBandwidth).toBeGreaterThan(0);
      expect(result.downloadBandwidth).toBeGreaterThan(0);
    });
  });

  describe('CPU vs GPU Comparison', () => {
    it('should compare CPU and GPU performance', async () => {
      const cpuFn = async () => {
        // Simulate CPU work
        let _sum = 0;
        for (let i = 0; i < 5000; i++) {
          _sum += Math.sqrt(i);
        }
      };

      const gpuFn = async () => {
        // Simulate faster GPU work
        let _sum = 0;
        for (let i = 0; i < 1000; i++) {
          _sum += Math.sqrt(i);
        }
      };

      const result = await benchmark.compareCPUvGPU('operation', cpuFn, gpuFn, {
        iterations: 3,
      });

      expect(result.speedup).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();
      expect(result.cpu.avgTime).toBeGreaterThan(0);
      expect(result.gpu.avgTime).toBeGreaterThan(0);
    });
  });

  describe('SyncManager readback metrics', () => {
    it('should track readback time and percentage', () => {
      const manager = new SyncManager();
      manager.recordEvent({ type: 'upload', duration: 10, dataSize: 1024 });
      manager.recordEvent({ type: 'compute', duration: 5 });
      manager.recordEvent({ type: 'download', duration: 20, dataSize: 2048 });

      const metrics = manager.getMetrics();
      expect(metrics.downloadTime).toBeGreaterThan(0);
      expect(metrics.readbackTimeMs).toBeCloseTo(metrics.downloadTime);
      expect(metrics.readbackPercentage).toBeGreaterThan(0);
      expect(metrics.readbackPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('Keyframe Search Algorithm', () => {
    it('should benchmark linear vs binary search', async () => {
      const size = 200000;
      const values = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        values[i] = i;
      }
      const targets = new Float32Array(1024);
      for (let i = 0; i < targets.length; i++) {
        targets[i] = (i * size) / targets.length;
      }

      const linearFn = async () => {
        let sum = 0;
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          let idx = size - 1;
          for (let j = 0; j < size; j++) {
            if (values[j] >= t) {
              idx = j;
              break;
            }
          }
          sum += idx;
        }
        if (sum === -1) {
          throw new Error('unreachable');
        }
      };

      const binaryFn = async () => {
        let sum = 0;
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          let left = 0;
          let right = size;
          let idx = size - 1;
          while (left < right) {
            const mid = (left + right) >>> 1;
            const v = values[mid];
            if (v < t) {
              left = mid + 1;
            } else {
              idx = mid;
              right = mid;
            }
          }
          sum += idx;
        }
        if (sum === -1) {
          throw new Error('unreachable');
        }
      };

      const linearResult = await benchmark.benchmark('keyframe-linear-search', linearFn, {
        iterations: 3,
        warmup: false,
      });
      const binaryResult = await benchmark.benchmark('keyframe-binary-search', binaryFn, {
        iterations: 3,
        warmup: false,
      });

      expect(linearResult.avgTime).toBeGreaterThan(0);
      expect(binaryResult.avgTime).toBeGreaterThan(0);
      expect(binaryResult.avgTime).toBeLessThan(linearResult.avgTime);
    });

    it('should benchmark adaptive search strategy across sizes', async () => {
      const benchmarkSizes = [8, 32, 128, 512];

      for (const size of benchmarkSizes) {
        const values = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          values[i] = i;
        }
        const targets = new Float32Array(256);
        for (let i = 0; i < targets.length; i++) {
          targets[i] = (i * size) / targets.length;
        }

        const linearFn = async () => {
          let sum = 0;
          for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            let idx = size - 1;
            for (let j = 0; j < size; j++) {
              if (values[j] >= t) {
                idx = j;
                break;
              }
            }
            sum += idx;
          }
          if (sum === -1) {
            throw new Error('unreachable');
          }
        };

        const binaryFn = async () => {
          let sum = 0;
          for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            let left = 0;
            let right = size;
            let idx = size - 1;
            while (left < right) {
              const mid = (left + right) >>> 1;
              const v = values[mid];
              if (v < t) {
                left = mid + 1;
              } else {
                idx = mid;
                right = mid;
              }
            }
            sum += idx;
          }
          if (sum === -1) {
            throw new Error('unreachable');
          }
        };

        const linearResult = await benchmark.benchmark(`adaptive-linear-${size}`, linearFn, {
          iterations: 2,
          warmup: false,
        });
        const binaryResult = await benchmark.benchmark(`adaptive-binary-${size}`, binaryFn, {
          iterations: 2,
          warmup: false,
        });

        expect(linearResult.avgTime).toBeGreaterThan(0);
        expect(binaryResult.avgTime).toBeGreaterThan(0);
      }
    });
  });
});

describe('PerformanceProfiler', () => {
  let profiler: PerformanceProfiler;

  beforeEach(() => {
    profiler = new PerformanceProfiler();
  });

  describe('Marking and Measuring', () => {
    it('should mark performance points', () => {
      profiler.mark('start');
      profiler.mark('end');

      // Marks are set, should not throw
      expect(() => profiler.measure('duration', 'start', 'end')).not.toThrow();
    });

    it('should measure duration between marks', () => {
      profiler.mark('start');

      // Simulate some work
      let _sum = 0;
      for (let i = 0; i < 1000; i++) {
        _sum += i;
      }

      profiler.mark('end');
      const duration = profiler.measure('compute', 'start', 'end');

      expect(duration).toBeGreaterThan(0);
    });

    it('should handle missing marks', () => {
      const duration = profiler.measure('test', 'missing-start', 'missing-end');
      expect(duration).toBe(-1);
    });

    it('should aggregate measurements', () => {
      profiler.mark('start');
      profiler.mark('mid');
      profiler.mark('end');

      profiler.measure('part1', 'start', 'mid');
      profiler.measure('part1', 'mid', 'end');
      profiler.measure('part1', 'start', 'end');

      const stats = profiler.getStats('part1');
      expect(stats?.measurements).toBe(3);
    });
  });

  describe('Statistics', () => {
    it('should calculate aggregate statistics', () => {
      profiler.mark('m1');
      profiler.mark('m2');
      profiler.mark('m3');

      profiler.measure('op', 'm1', 'm2');
      profiler.measure('op', 'm2', 'm3');

      const stats = profiler.getStats('op');
      expect(stats?.measurements).toBe(2);
      expect(stats?.total).toBeGreaterThan(0);
      expect(stats?.average).toBeLessThanOrEqual(stats && stats.max ? stats.max : 0);
    });

    it('should return null for unknown measurement', () => {
      const stats = profiler.getStats('unknown');
      expect(stats).toBeNull();
    });
  });

  describe('Reporting', () => {
    it('should generate summary', () => {
      profiler.mark('start');
      profiler.mark('end');
      profiler.measure('operation', 'start', 'end');

      const summary = profiler.summary();
      expect(summary).toContain('operation');
      expect(summary).toContain('Avg');
    });

    it('should clear profiling data', () => {
      profiler.mark('start');
      profiler.mark('end');
      profiler.measure('op', 'start', 'end');

      profiler.clear();

      const stats = profiler.getStats('op');
      expect(stats).toBeNull();
    });
  });
});

describe('RegressionTestHarness', () => {
  let harness: RegressionTestHarness;

  beforeEach(() => {
    harness = new RegressionTestHarness(0.1); // 10% tolerance
  });

  describe('Baseline Management', () => {
    it('should set baseline performance', () => {
      harness.setBaseline('operation', 100);
      const baselines = harness.getBaselines();
      expect(baselines.operation).toBe(100);
    });

    it('should clear baselines', () => {
      harness.setBaseline('op1', 100);
      harness.setBaseline('op2', 200);
      harness.clearBaselines();

      const baselines = harness.getBaselines();
      expect(Object.keys(baselines)).toHaveLength(0);
    });
  });

  describe('Regression Detection', () => {
    it('should detect no regression when performance improves', () => {
      harness.setBaseline('operation', 100);

      const result = harness.checkRegression('operation', 95);
      expect(result.passed).toBe(true);
      expect(result.deltaPercent).toBeLessThan(0);
    });

    it('should allow acceptable slowdown', () => {
      harness.setBaseline('operation', 100);

      // 8% slowdown is within 10% tolerance
      const result = harness.checkRegression('operation', 108);
      expect(result.passed).toBe(true);
    });

    it('should detect regression beyond tolerance', () => {
      harness.setBaseline('operation', 100);

      // 15% slowdown exceeds 10% tolerance
      const result = harness.checkRegression('operation', 115);
      expect(result.passed).toBe(false);
      expect(result.deltaPercent).toBeGreaterThan(10);
    });

    it('should pass when no baseline is set', () => {
      const result = harness.checkRegression('unknown-op', 50);
      expect(result.passed).toBe(true);
      expect(result.baseline).toBeUndefined();
    });

    it('should calculate delta correctly', () => {
      harness.setBaseline('operation', 100);

      const result = harness.checkRegression('operation', 120);
      expect(result.delta).toBe(20);
      expect(result.deltaPercent).toBe(20);
    });
  });

  describe('Custom Tolerance', () => {
    it('should respect custom tolerance', () => {
      const strictHarness = new RegressionTestHarness(0.05); // 5% tolerance
      strictHarness.setBaseline('operation', 100);

      // 6% slowdown exceeds 5% tolerance
      const result = strictHarness.checkRegression('operation', 106);
      expect(result.passed).toBe(false);
    });
  });
});
