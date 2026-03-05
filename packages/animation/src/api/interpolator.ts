export interface Interpolator {
  evaluate(progress: number): number;
}
