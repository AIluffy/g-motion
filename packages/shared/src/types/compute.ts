export interface ComputeProvider {
  readonly name: string;
  initialize(device?: unknown): Promise<void>;
  dispatch(kernel: string, data: Float32Array, workgroups: number): void;
  readBuffer(name: string): Promise<Float32Array>;
  destroy(): void;
}

export interface ComputeProviderFactory {
  create(config?: Record<string, unknown>): ComputeProvider;
}
