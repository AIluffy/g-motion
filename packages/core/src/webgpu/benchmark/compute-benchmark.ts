import { createDebugger } from '@g-motion/utils';
import type { BenchmarkResult, ComparativeBenchmarkResult } from './types';
import { calculateBenchmarkResult } from './stats';
import { formatBenchmarkReport } from './report';

const warn = createDebugger('Benchmark', 'warn');
const errorLog = createDebugger('Benchmark', 'error');

export class ComputeBenchmark {
  private results = new Map<string, BenchmarkResult[]>();

  async benchmark(
    name: string,
    fn: () => Promise<void>,
    options: { iterations?: number; warmup?: boolean } = {},
  ): Promise<BenchmarkResult> {
    const iterations = options.iterations || 10;
    const warmup = options.warmup !== false;

    if (warmup) {
      try {
        await fn();
      } catch (e) {
        warn(`Warmup failed for '${name}':`, e);
      }
    }

    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await fn();
      } catch (e) {
        errorLog(`Iteration ${i} failed for '${name}':`, e);
        continue;
      }
      times.push(performance.now() - start);
    }

    if (times.length === 0) {
      throw new Error(`[Benchmark] No successful iterations for '${name}'`);
    }

    const result = calculateBenchmarkResult(name, times);
    (this.results.get(name) ?? this.results.set(name, []).get(name)!).push(result);
    return result;
  }

  async compareCPUvGPU(
    name: string,
    cpuFn: () => Promise<void>,
    gpuFn: () => Promise<void>,
    options: { iterations?: number } = {},
  ): Promise<ComparativeBenchmarkResult> {
    const cpu = await this.benchmark(`${name}-cpu`, cpuFn, options);
    const gpu = await this.benchmark(`${name}-gpu`, gpuFn, options);
    const speedup = cpu.avgTime / gpu.avgTime;
    const recommendation =
      speedup > 2
        ? 'GPU is significantly faster. Recommended for GPU execution.'
        : speedup > 1.1
          ? 'GPU is moderately faster. GPU execution can improve performance.'
          : speedup > 0.9
            ? 'Performance is comparable. Consider CPU for simplicity.'
            : 'CPU is faster. GPU overhead dominates computation time.';
    return { cpu, gpu, speedup, recommendation };
  }

  async benchmarkDataTransfer(
    name: string,
    uploadFn: () => Promise<number>,
    downloadFn: () => Promise<number>,
    options: { iterations?: number } = {},
  ): Promise<{
    upload: BenchmarkResult;
    uploadBandwidth: number;
    download: BenchmarkResult;
    downloadBandwidth: number;
  }> {
    const iterations = options.iterations || 5;

    const uploadTimes: number[] = [];
    const uploadSizes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const size = await uploadFn();
      uploadTimes.push(performance.now() - start);
      uploadSizes.push(size);
    }

    const downloadTimes: number[] = [];
    const downloadSizes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const size = await downloadFn();
      downloadTimes.push(performance.now() - start);
      downloadSizes.push(size);
    }

    const upload = calculateBenchmarkResult(`${name}-upload`, uploadTimes);
    const download = calculateBenchmarkResult(`${name}-download`, downloadTimes);
    const avgUploadSize = uploadSizes.reduce((a, b) => a + b, 0) / uploadSizes.length;
    const avgDownloadSize = downloadSizes.reduce((a, b) => a + b, 0) / downloadSizes.length;
    return {
      upload,
      uploadBandwidth: (avgUploadSize / upload.avgTime) * 1000,
      download,
      downloadBandwidth: (avgDownloadSize / download.avgTime) * 1000,
    };
  }

  getResults(name?: string): BenchmarkResult[] {
    if (name) return this.results.get(name) || [];
    const all: BenchmarkResult[] = [];
    for (const results of this.results.values()) {
      for (let i = 0; i < results.length; i++) {
        all.push(results[i]!);
      }
    }
    return all;
  }

  generateReport(name?: string): string {
    return formatBenchmarkReport(this.getResults(name));
  }

  clearResults(): void {
    this.results.clear();
  }
}
