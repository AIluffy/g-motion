import { createDebugger } from '@g-motion/shared';

const warn = createDebugger('Benchmark', 'warn');

export class PerformanceProfiler {
  private marks = new Map<string, number>();
  private measures = new Map<string, number[]>();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark: string): number {
    const startTime = this.marks.get(startMark);
    const endTime = this.marks.get(endMark);
    if (startTime === undefined || endTime === undefined) {
      warn(`Mark not found for measure '${name}' (start: ${startMark}, end: ${endMark})`);
      return -1;
    }
    const duration = endTime - startTime;
    (this.measures.get(name) ?? this.measures.set(name, []).get(name)!).push(duration);
    return duration;
  }

  getStats(
    name: string,
  ): { measurements: number; total: number; average: number; min: number; max: number } | null {
    const measurements = this.measures.get(name);
    if (!measurements || measurements.length === 0) return null;

    const total = measurements.reduce((a, b) => a + b, 0);
    const average = total / measurements.length;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < measurements.length; i++) {
      const t = measurements[i]!;
      if (t < min) min = t;
      if (t > max) max = t;
    }
    return { measurements: measurements.length, total, average, min, max };
  }

  summary(): string {
    let out = 'Profiling Summary\n' + '='.repeat(50) + '\n';
    for (const [name] of this.measures) {
      const stats = this.getStats(name);
      if (!stats) continue;
      out +=
        `
${name}:
  Count: ${stats.measurements}
  Total: ${stats.total.toFixed(2)}ms
  Avg: ${stats.average.toFixed(4)}ms
  Min: ${stats.min.toFixed(4)}ms
  Max: ${stats.max.toFixed(4)}ms
        `.trim() + '\n';
    }
    return out;
  }

  clear(): void {
    this.marks.clear();
    this.measures.clear();
  }
}
