import type { ComponentDef, ComponentValue } from './types';

export type { ComponentDef, ComponentType, ComponentValue } from './types';

export type GPUComputeMode = 'auto' | 'always' | 'never';

export type TransformTypedBuffers = Record<
  string,
  Float32Array | Float64Array | Int32Array | undefined
>;

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
  componentBuffers: Map<string, Array<ComponentValue | undefined>>;
  transformTypedBuffers: TransformTypedBuffers;
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
  samplingMode?: 'time' | 'frame';
  samplingFps?: number;

  workSlicing?: {
    enabled?: boolean;
    batchSamplingArchetypesPerFrame?: number;
    interpolationArchetypesPerFrame?: number;
  };

  keyframePreprocess?: {
    enabled?: boolean;
    timeInterval?: number;
    maxSubdivisionsPerSegment?: number;
  };

  /**
   * Whether to enable GPU-accelerated easing functions.
   * Default: true
   */
  gpuEasing?: boolean;

  gpuOnlyInterpolation?: boolean;

  keyframeSearchOptimized?: boolean;

  metricsSamplingRate?: number;

  debugWebGPUIO?: boolean;
  debug?: {
    webgpuIO?: boolean;
    physicsValidation?: boolean;
  };

  webgpuCulling?: {
    enabled?: boolean;
    viewport?: boolean;
    async?: boolean;
  };

  physicsMaxVelocity?: number;
  physicsValidation?: boolean;
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
  sampling?: {
    engineFrame: number;
    timeMs: number;
    fps: number;
    framePosition: number;
    frame: number;
    deltaFrame: number;
    deltaTimeMs: number;
  };
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
