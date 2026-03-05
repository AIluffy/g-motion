export interface MetricsCollector {
  mark(name: string, metadata?: Record<string, unknown>): void;
  measure(name: string, durationMs: number, metadata?: Record<string, unknown>): void;
}

export const noopMetricsCollector: MetricsCollector = {
  mark: () => {},
  measure: () => {},
};
