import type { ComponentDef, ComponentValue, TransformTypedBuffers } from '@g-motion/shared';

export type {
  ComponentDef,
  ComponentType,
  ComponentValue,
  TransformTypedBuffers,
} from '@g-motion/shared';

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
  preFrame?(): void;
  postFrame?(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateWithAccessor?(
    entity: number,
    arget: any,
    getComponent: (name: string) => any,
    getTransformTyped?: () => any,
  ): void;
  updateBatch?(ctx: RendererBatchContext): void;
}

/**
 * Configuration options for Motion animation engine.
 */
export interface MotionAppConfig {
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

  keyframeSearchOptimized?: boolean;
  keyframeEntryExpandOnGPU?: boolean;
  keyframeSearchIndexed?: boolean;
  keyframeSearchIndexedMinKeyframes?: number;
  timelineFlat?: boolean;
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

  webgpuStatesConditionalUpload?: boolean;
  webgpuForceStatesUpload?: boolean;
  webgpuBatchedSubmit?: boolean;
  webgpuReadbackMode?: 'full' | 'visible';
  webgpuOutputBufferReuse?: boolean;
  batchSamplingStaticReuse?: boolean;
  physicsMaxVelocity?: number;
  physicsValidation?: boolean;
}

export interface EngineServices {
  world: import('./world').World;
  scheduler: import('./scheduler').SystemScheduler;
  app: MotionApp;
  config: MotionAppConfig;
  batchProcessor: import('./systems/batch').ComputeBatchProcessor;
  metrics: import('@g-motion/webgpu').GPUMetricsProvider;
  appContext: import('./context').AppContext;
}

export interface SystemContext {
  services: EngineServices;
  dt: number;
  nowMs: number;
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
  registerGpuEasing(wgslFn: string): string;
  registerShader(shader: ShaderDef): void;
  getConfig(): MotionAppConfig;
  getRenderer(name: string): RendererDef | undefined;
}

/**
 * Plugin component definition
 */
export interface PluginComponentDef {
  schema: Record<string, 'float32' | 'float64' | 'int32' | 'string' | 'object'>;
}

/**
 * GPU Shader binding definition
 */
export interface ShaderBindingDef {
  name: string;
  type: 'storage' | 'uniform' | 'sampler' | 'texture';
  access?: 'read' | 'write' | 'read_write';
}

/**
 * GPU Shader module definition
 */
export interface ShaderModuleDef {
  code: string;
  entryPoint?: string;
  bindings?: ShaderBindingDef[];
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  [key: string]: unknown;
}

/**
 * Plugin manifest - self-contained plugin definition
 */
export interface PluginManifest {
  components?: Record<string, PluginComponentDef>;
  systems?: SystemDef[];
  shaders?: Record<string, ShaderModuleDef>;
  config?: PluginConfig;
  setup?(app: MotionApp, services?: EngineServices): void;
}

/**
 * Shader registration options
 */
export interface ShaderDef {
  name: string;
  code: string;
  entryPoint?: string;
  bindings?: ShaderBindingDef[];
}

export interface MotionPlugin {
  name: string;
  version?: string;

  manifest: PluginManifest;
}

/**
 * Global plugin registry for auto-discovery
 */
const PLUGIN_REGISTRY: MotionPlugin[] = [];

/**
 * Registered plugin names for idempotency checking
 */
const REGISTERED_PLUGIN_NAMES = new Set<string>();

/**
 * Register a plugin in the global registry for auto-discovery
 *
 * @param plugin - The plugin to register
 * @returns true if registered successfully, false if already registered (idempotent)
 */
export function registerPlugin(plugin: MotionPlugin): boolean {
  // Idempotent registration - don't register twice
  if (REGISTERED_PLUGIN_NAMES.has(plugin.name)) {
    return false;
  }

  PLUGIN_REGISTRY.push(plugin);
  REGISTERED_PLUGIN_NAMES.add(plugin.name);
  return true;
}

/**
 * Get all registered plugins
 *
 * @returns Array of registered plugins
 */
export function getRegisteredPlugins(): readonly MotionPlugin[] {
  return PLUGIN_REGISTRY;
}

/**
 * Clear the plugin registry (for test isolation)
 *
 * @warning This will remove all registered plugins. Use with caution.
 */
export function clearPluginRegistry(): void {
  PLUGIN_REGISTRY.length = 0;
  REGISTERED_PLUGIN_NAMES.clear();
}

/**
 * Check if a plugin is already registered
 *
 * @param pluginName - Name of the plugin to check
 * @returns true if the plugin is registered
 */
export function isPluginRegistered(pluginName: string): boolean {
  return REGISTERED_PLUGIN_NAMES.has(pluginName);
}
