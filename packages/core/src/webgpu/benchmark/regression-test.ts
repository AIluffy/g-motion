export class RegressionTestHarness {
  private baselines = new Map<string, number>();
  private tolerance: number = 0.1;

  constructor(tolerance?: number) {
    if (tolerance !== undefined) this.tolerance = tolerance;
  }

  setBaseline(name: string, timeMs: number): void {
    this.baselines.set(name, timeMs);
  }

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
    return { passed, baseline, current: currentTimeMs, delta, deltaPercent };
  }

  getBaselines(): Record<string, number> {
    return Object.fromEntries(this.baselines);
  }

  clearBaselines(): void {
    this.baselines.clear();
  }
}
