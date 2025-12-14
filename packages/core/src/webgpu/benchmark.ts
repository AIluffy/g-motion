/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Performance Benchmarking and Profiling Utilities
 *
 * Provides comprehensive performance measurement tools for
 * GPU compute shader execution and data transfer optimization.
 */

/**
 * Benchmark result for a single operation
 */
export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  avgTime: number;
  stdDev: number;
  timestamp: number;
}

/**
 * Comparative benchmark result
 */
export interface ComparativeBenchmarkResult {
  cpu: BenchmarkResult;
  gpu: BenchmarkResult;
  speedup: number; // gpu time / cpu time
  recommendation: string;
}

/**
 * Memory benchmark metrics
 */
export interface MemoryMetrics {
  uploadMemory: number;
  computeMemory: number;
  downloadMemory: number;
  totalMemory: number;
  peakMemory: number;
}

/**
 * Compute Benchmark Harness
 * Measures and profiles compute shader execution
 */
export class ComputeBenchmark {
  private results = new Map<string, BenchmarkResult[]>();

  /**
   * Run benchmark with given function
   */
  async benchmark(
    name: string,
    fn: () => Promise<void>,
    options: { iterations?: number; warmup?: boolean } = {},
  ): Promise<BenchmarkResult> {
    const iterations = options.iterations || 10;
    const warmup = options.warmup !== false;

    // Warmup run
    if (warmup) {
      try {
        await fn();
      } catch (e) {
        console.warn(`[Benchmark] Warmup failed for '${name}':`, e);
      }
    }

    // Actual benchmark runs
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await fn();
      } catch (e) {
        console.error(`[Benchmark] Iteration ${i} failed for '${name}':`, e);
        continue;
      }
      const duration = performance.now() - start;
      times.push(duration);
    }

    if (times.length === 0) {
      throw new Error(`[Benchmark] No successful iterations for '${name}'`);
    }

    const result = this.calculateStats(name, times);

    if (!this.results.has(name)) {
      this.results.set(name, []);
    }
    this.results.get(name)!.push(result);

    return result;
  }

  /**
   * Compare CPU vs GPU performance
   */
  async compareCPUvGPU(
    name: string,
    cpuFn: () => Promise<void>,
    gpuFn: () => Promise<void>,
    options: { iterations?: number } = {},
  ): Promise<ComparativeBenchmarkResult> {
    const cpuResult = await this.benchmark(`${name}-cpu`, cpuFn, options);
    const gpuResult = await this.benchmark(`${name}-gpu`, gpuFn, options);

    const speedup = cpuResult.avgTime / gpuResult.avgTime;
    let recommendation = '';

    if (speedup > 2) {
      recommendation = 'GPU is significantly faster. Recommended for GPU execution.';
    } else if (speedup > 1.1) {
      recommendation = 'GPU is moderately faster. GPU execution can improve performance.';
    } else if (speedup > 0.9) {
      recommendation = 'Performance is comparable. Consider CPU for simplicity.';
    } else {
      recommendation = 'CPU is faster. GPU overhead dominates computation time.';
    }

    return { cpu: cpuResult, gpu: gpuResult, speedup, recommendation };
  }

  /**
   * Benchmark data transfer operations
   */
  async benchmarkDataTransfer(
    name: string,
    uploadFn: () => Promise<number>,
    downloadFn: () => Promise<number>,
    options: { iterations?: number } = {},
  ) {
    const iterations = options.iterations || 5;

    const uploadTimes: number[] = [];
    const uploadSizes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const size = await uploadFn();
      const duration = performance.now() - start;
      uploadTimes.push(duration);
      uploadSizes.push(size);
    }

    const downloadTimes: number[] = [];
    const downloadSizes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const size = await downloadFn();
      const duration = performance.now() - start;
      downloadTimes.push(duration);
      downloadSizes.push(size);
    }

    const uploadStats = this.calculateStats(`${name}-upload`, uploadTimes);
    const downloadStats = this.calculateStats(`${name}-download`, downloadTimes);

    const avgUploadSize = uploadSizes.reduce((a, b) => a + b, 0) / uploadSizes.length;
    const avgDownloadSize = downloadSizes.reduce((a, b) => a + b, 0) / downloadSizes.length;

    return {
      upload: uploadStats,
      uploadBandwidth: (avgUploadSize / uploadStats.avgTime) * 1000, // MB/s
      download: downloadStats,
      downloadBandwidth: (avgDownloadSize / downloadStats.avgTime) * 1000, // MB/s
    };
  }

  /**
   * Get all benchmark results
   */
  getResults(name?: string): BenchmarkResult[] {
    if (name) {
      return this.results.get(name) || [];
    }

    const allResults: BenchmarkResult[] = [];
    for (const results of this.results.values()) {
      allResults.push(...results);
    }
    return allResults;
  }

  /**
   * Generate benchmark report
   */
  generateReport(name?: string): string {
    const results = this.getResults(name);

    if (results.length === 0) {
      return '[Benchmark] No results available';
    }

    let report = `Benchmark Report\n${'='.repeat(60)}\n`;

    for (const result of results) {
      report +=
        `
Operation: ${result.name}
  Iterations: ${result.iterations}
  Total Time: ${result.totalTime.toFixed(2)}ms
  Min Time: ${result.minTime.toFixed(4)}ms
  Max Time: ${result.maxTime.toFixed(4)}ms
  Avg Time: ${result.avgTime.toFixed(4)}ms
  Std Dev: ${result.stdDev.toFixed(4)}ms
      `.trim() + '\n';
    }

    return report;
  }

  /**
   * Clear all results
   */
  clearResults(): void {
    this.results.clear();
  }

  /**
   * Calculate statistics from timing samples
   */
  private calculateStats(name: string, times: number[]): BenchmarkResult {
    const totalTime = times.reduce((a, b) => a + b, 0);
    const avgTime = totalTime / times.length;

    const variance = times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);

    return {
      name,
      iterations: times.length,
      totalTime,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      avgTime,
      stdDev,
      timestamp: Date.now(),
    };
  }
}

/**
 * Performance Profiler
 * Tracks and analyzes performance bottlenecks
 */
export class PerformanceProfiler {
  private marks = new Map<string, number>();
  private measures = new Map<string, number[]>();

  /**
   * Mark a point in time
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * Measure time between two marks
   */
  measure(name: string, startMark: string, endMark: string): number {
    const startTime = this.marks.get(startMark);
    const endTime = this.marks.get(endMark);

    if (startTime === undefined || endTime === undefined) {
      console.warn(
        `[Profiler] Mark not found for measure '${name}' (start: ${startMark}, end: ${endMark})`,
      );
      return -1;
    }

    const duration = endTime - startTime;

    if (!this.measures.has(name)) {
      this.measures.set(name, []);
    }
    this.measures.get(name)!.push(duration);

    return duration;
  }

  /**
   * Get profiling statistics
   */
  getStats(name: string) {
    const measurements = this.measures.get(name);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const total = measurements.reduce((a, b) => a + b, 0);
    const avg = total / measurements.length;

    return {
      measurements: measurements.length,
      total,
      average: avg,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
    };
  }

  /**
   * Generate profiling summary
   */
  summary(): string {
    let summary = 'Profiling Summary\n' + '='.repeat(50) + '\n';

    for (const [name] of this.measures) {
      const stats = this.getStats(name);
      if (stats) {
        summary +=
          `
${name}:
  Count: ${stats.measurements}
  Total: ${stats.total.toFixed(2)}ms
  Avg: ${stats.average.toFixed(4)}ms
  Min: ${stats.min.toFixed(4)}ms
  Max: ${stats.max.toFixed(4)}ms
        `.trim() + '\n';
      }
    }

    return summary;
  }

  /**
   * Clear profiling data
   */
  clear(): void {
    this.marks.clear();
    this.measures.clear();
  }
}

/**
 * Regression Test Harness
 * Detects performance regressions
 */
export class RegressionTestHarness {
  private baselines = new Map<string, number>();
  private tolerance: number = 0.1; // 10% tolerance by default

  constructor(tolerance?: number) {
    if (tolerance !== undefined) {
      this.tolerance = tolerance;
    }
  }

  /**
   * Set baseline performance
   */
  setBaseline(name: string, timeMs: number): void {
    this.baselines.set(name, timeMs);
  }

  /**
   * Check for regression
   */
  checkRegression(
    name: string,
    currentTimeMs: number,
  ): {
    passed: boolean;
    baseline: number | undefined;
    current: number;
    delta: number;
    deltaPercent: number;
  } {
    const baseline = this.baselines.get(name);

    if (baseline === undefined) {
      return {
        passed: true,
        baseline: undefined,
        current: currentTimeMs,
        delta: 0,
        deltaPercent: 0,
      };
    }

    const delta = currentTimeMs - baseline;
    const deltaPercent = (delta / baseline) * 100;
    const passed = Math.abs(deltaPercent) <= this.tolerance * 100;

    return {
      passed,
      baseline,
      current: currentTimeMs,
      delta,
      deltaPercent,
    };
  }

  /**
   * Get all baselines
   */
  getBaselines(): Record<string, number> {
    return Object.fromEntries(this.baselines);
  }

  /**
   * Clear baselines
   */
  clearBaselines(): void {
    this.baselines.clear();
  }
}
