export interface MotionValue {
  get(): number;
  set(value: number): void;
  update(updater: (value: number) => number): void;
  onChange(listener: (latest: number, delta: number) => void): () => void;
}

export interface MotionValueRangeConfig {
  input: [number, number];
  output: [number, number];
}

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export type TransformFunction = (value: number) => number;
