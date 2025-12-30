export type ComponentType = 'float32' | 'float64' | 'int32' | 'string' | 'object';

export type GPUComputeMode = 'auto' | 'always' | 'never';

export interface ComponentDef {
  schema: Record<string, ComponentType>;
}

export interface SystemDef {
  name: string;
  order?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(dt: number, ctx?: SystemContext): void;
}

export interface RendererBatchContext {
  world: import('./world').World;
  archetypeId: string;
  entityIds: number[];
  targets: unknown[];
  componentBuffers: Map<string, Array<unknown>>;
  transformTypedBuffers: Record<string, unknown>;
}

export interface RendererDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(entity: number, target: any, components: any): void;
  preFrame?(): void; // Optional: called before batch processing begins
  postFrame?(): void; // Optional: called after all entities processed
  // Optional fast-path: avoid per-entity object allocation in RenderSystem
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateWithAccessor?(
    entity: number,
    arget: any,
    getComponent: (name: string) => any,
    getTransformTyped?: () => any,
  ): void;
  // Optional batch interface: process a whole archetype at once
  updateBatch?(ctx: RendererBatchContext): void;
}

/**
 * Configuration options for Motion animation engine.
 */
export interface MotionAppConfig {
  /**
   * @deprecated No longer used. GPU is now enabled by default for all animations.
   * Use gpuCompute='never' to disable GPU acceleration.
   */
  webgpuThreshold?: number;

  /**
   * GPU compute mode for animation calculations.
   * 'auto': Same as 'always' (GPU-first with automatic CPU fallback)
   * 'always': Always attempt GPU compute, fall back to CPU if unavailable (default)
   * 'never': Always use CPU for animations
   * Default: 'always'
   */
  gpuCompute?: GPUComputeMode;

  // Engine runtime configuration
  globalSpeed?: number;
  targetFps?: number;
  frameDuration?: number;

  workSlicing?: {
    enabled?: boolean;
    batchSamplingArchetypesPerFrame?: number;
    interpolationArchetypesPerFrame?: number;
  };

  /**
   * Whether to enable GPU-accelerated easing functions.
   * Default: true
   */
  gpuEasing?: boolean;

  gpuOnlyInterpolation?: boolean;
}

export interface EngineServices {
  world: import('./world').World;
  scheduler: import('./scheduler').SystemScheduler;
  app: MotionApp;
  config: MotionAppConfig;
  batchProcessor: import('./systems/batch').ComputeBatchProcessor;
  metrics: import('./webgpu/metrics-provider').GPUMetricsProvider;
  errorHandler: import('./error-handler').ErrorHandler;
  appContext: import('./context').AppContext;
}

export interface SystemContext {
  services: EngineServices;
  dt: number;
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
  setup(app: MotionApp, services?: EngineServices): void;
}
