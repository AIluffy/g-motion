export class NonNegativeRollingAverage {
  private total = 0;
  private samples: number[] = [];
  private cursor = 0;
  private numSamples: number;

  constructor(numSamples = 30) {
    this.numSamples = numSamples;
  }

  addSample(value: number): void {
    if (!Number.isNaN(value) && Number.isFinite(value) && value >= 0) {
      this.total += value - (this.samples[this.cursor] || 0);
      this.samples[this.cursor] = value;
      this.cursor = (this.cursor + 1) % this.numSamples;
    }
  }

  get(): number {
    return this.samples.length > 0 ? this.total / this.samples.length : 0;
  }

  reset(): void {
    this.total = 0;
    this.samples = [];
    this.cursor = 0;
  }
}
