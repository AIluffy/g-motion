export class NonNegativeRollingAverage {
  private total = 0;
  private samples: number[] = [];
  private cursor = 0;
  private numSamples: number;
  private filledCount = 0;

  constructor(numSamples = 30) {
    this.numSamples = numSamples;
    this.samples = new Array<number>(numSamples).fill(0);
  }

  addSample(value: number): void {
    if (!Number.isNaN(value) && Number.isFinite(value) && value >= 0) {
      this.total += value - (this.samples[this.cursor] ?? 0);
      this.samples[this.cursor] = value;
      this.cursor = (this.cursor + 1) % this.numSamples;
      if (this.filledCount < this.numSamples) {
        this.filledCount++;
      }
    }
  }

  get(): number {
    return this.filledCount > 0 ? this.total / this.filledCount : 0;
  }

  reset(): void {
    this.total = 0;
    this.samples.fill(0);
    this.cursor = 0;
    this.filledCount = 0;
  }
}
