import type { BenchmarkResult } from './types';

export function formatBenchmarkReport(results: BenchmarkResult[]): string {
  if (results.length === 0) return '[Benchmark] No results available';
  let report = `Benchmark Report\n${'='.repeat(60)}\n`;
  for (const r of results) {
    report +=
      `
Operation: ${r.name}
  Iterations: ${r.iterations}
  Total Time: ${r.totalTime.toFixed(2)}ms
  Min Time: ${r.minTime.toFixed(4)}ms
  Max Time: ${r.maxTime.toFixed(4)}ms
  Avg Time: ${r.avgTime.toFixed(4)}ms
  Std Dev: ${r.stdDev.toFixed(4)}ms
      `.trim() + '\n';
  }
  return report;
}
