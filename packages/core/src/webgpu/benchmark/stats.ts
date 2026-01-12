import type { BenchmarkResult } from './types';

export function calculateBenchmarkResult(name: string, times: number[]): BenchmarkResult {
  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / times.length;
  const variance = times.reduce((sum, t) => sum + (t - avgTime) * (t - avgTime), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    if (t < minTime) minTime = t;
    if (t > maxTime) maxTime = t;
  }

  return {
    name,
    iterations: times.length,
    totalTime,
    minTime,
    maxTime,
    avgTime,
    stdDev,
    timestamp: Date.now(),
  };
}
