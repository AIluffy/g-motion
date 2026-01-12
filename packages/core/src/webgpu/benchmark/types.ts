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

export interface ComparativeBenchmarkResult {
  cpu: BenchmarkResult;
  gpu: BenchmarkResult;
  speedup: number;
  recommendation: string;
}

export interface MemoryMetrics {
  uploadMemory: number;
  computeMemory: number;
  downloadMemory: number;
  totalMemory: number;
  peakMemory: number;
}
