export type ComponentType = 'float32' | 'float64' | 'int32' | 'string' | 'object';

export type GPUComputeMode = 'auto' | 'always' | 'never';

export interface ComponentDef {
  schema: Record<string, ComponentType>;
}

export interface SystemDef {
  name: string;
  order?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(dt: number, entities?: Int32Array): void;
}

export interface RendererDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(entity: number, target: any, components: any): void;
  preFrame?(): void; // Optional: called before batch processing begins
  postFrame?(): void; // Optional: called after all entities processed
}

/**
 * Configuration options for Motion animation engine.
 */
export interface MotionAppConfig {
  /**
   * Entity count threshold at which to enable GPU batch processing.
   * Default: 1000. Set to Infinity to disable GPU acceleration.
   */
  webgpuThreshold?: number;

  /**
   * GPU compute mode for easing calculations.
   * 'auto': Use GPU if available and entity count exceeds threshold
   * 'always': Always use GPU compute for easing
   * 'never': Always use CPU for easing
   * Default: 'auto'
   */
  gpuCompute?: GPUComputeMode;

  /**
   * Whether to enable GPU-accelerated easing functions.
   * Default: true
   */
  gpuEasing?: boolean;
}

// Minimal interface to avoid circular dependency with App
export interface MotionApp {
  registerComponent(name: string, def: ComponentDef): void;
  registerSystem(system: SystemDef): void;
  registerRenderer(name: string, renderer: RendererDef): void;
  registerEasing(name: string, fn: (t: number) => number): void;
  registerGpuEasing(name: string, fn: (t: number) => number, wgslFn: string): void;
  getConfig(): MotionAppConfig;
  getRenderer(name: string): RendererDef | undefined;
}

export interface MotionPlugin {
  name: string;
  version?: string;
  setup(app: MotionApp): void;
}
