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

  keyframe?: {
    preprocess?: {
      enabled?: boolean;
      timeInterval?: number;
      maxSubdivisionsPerSegment?: number;
    };
    searchOptimized?: boolean;
    entryExpandOnGPU?: boolean;
    searchIndexed?: boolean;
    searchIndexedMinKeyframes?: number;
    timelineFlat?: boolean;
  };
  metricsSamplingRate?: number;

  debug?: {
    webgpuIO?: boolean;
    physicsValidation?: boolean;
  };

  webgpu?: {
    culling?: {
      enabled?: boolean;
      viewport?: boolean;
      async?: boolean;
    };
    statesConditionalUpload?: boolean;
    forceStatesUpload?: boolean;
    forceWorkgroupSize?: number;
    batchedSubmit?: boolean;
    readbackMode?: 'full' | 'visible';
    outputBufferReuse?: boolean;
  };
  batchSamplingStaticReuse?: boolean;
  physicsMaxVelocity?: number;

  /** @deprecated use keyframe.preprocess */
  keyframePreprocess?: {
    enabled?: boolean;
    timeInterval?: number;
    maxSubdivisionsPerSegment?: number;
  };
  /** @deprecated use keyframe.searchOptimized */
  keyframeSearchOptimized?: boolean;
  /** @deprecated use keyframe.entryExpandOnGPU */
  keyframeEntryExpandOnGPU?: boolean;
  /** @deprecated use keyframe.searchIndexed */
  keyframeSearchIndexed?: boolean;
  /** @deprecated use keyframe.searchIndexedMinKeyframes */
  keyframeSearchIndexedMinKeyframes?: number;
  /** @deprecated use keyframe.timelineFlat */
  timelineFlat?: boolean;
  /** @deprecated use debug.webgpuIO */
  debugWebGPUIO?: boolean;
  /** @deprecated use debug.physicsValidation */
  physicsValidation?: boolean;
  /** @deprecated use webgpu.culling */
  webgpuCulling?: {
    enabled?: boolean;
    viewport?: boolean;
    async?: boolean;
  };
  /** @deprecated use webgpu.statesConditionalUpload */
  webgpuStatesConditionalUpload?: boolean;
  /** @deprecated use webgpu.forceStatesUpload */
  webgpuForceStatesUpload?: boolean;
  /** @deprecated use webgpu.batchedSubmit */
  webgpuBatchedSubmit?: boolean;
  /** @deprecated use webgpu.readbackMode */
  webgpuReadbackMode?: 'full' | 'visible';
  /** @deprecated use webgpu.outputBufferReuse */
  webgpuOutputBufferReuse?: boolean;
}

export interface NormalizedMotionAppConfig extends MotionAppConfig {
  keyframe?: MotionAppConfig['keyframe'];
  debug?: MotionAppConfig['debug'];
  webgpu?: MotionAppConfig['webgpu'];
}

export function normalizeConfig(config: MotionAppConfig = {}): NormalizedMotionAppConfig {
  const source: MotionAppConfig = config ?? {};
  const warnDeprecated = (field: string, replacement: string) => {
    console.warn(`[MotionAppConfig] "${field}" 已废弃，请使用 "${replacement}"。`);
  };

  if (source.keyframePreprocess !== undefined)
    warnDeprecated('keyframePreprocess', 'keyframe.preprocess');
  if (source.keyframeSearchOptimized !== undefined)
    warnDeprecated('keyframeSearchOptimized', 'keyframe.searchOptimized');
  if (source.keyframeEntryExpandOnGPU !== undefined)
    warnDeprecated('keyframeEntryExpandOnGPU', 'keyframe.entryExpandOnGPU');
  if (source.keyframeSearchIndexed !== undefined)
    warnDeprecated('keyframeSearchIndexed', 'keyframe.searchIndexed');
  if (source.keyframeSearchIndexedMinKeyframes !== undefined)
    warnDeprecated('keyframeSearchIndexedMinKeyframes', 'keyframe.searchIndexedMinKeyframes');
  if (source.timelineFlat !== undefined) warnDeprecated('timelineFlat', 'keyframe.timelineFlat');
  if (source.debugWebGPUIO !== undefined) warnDeprecated('debugWebGPUIO', 'debug.webgpuIO');
  if (source.physicsValidation !== undefined)
    warnDeprecated('physicsValidation', 'debug.physicsValidation');
  if (source.webgpuCulling !== undefined) warnDeprecated('webgpuCulling', 'webgpu.culling');
  if (source.webgpuStatesConditionalUpload !== undefined)
    warnDeprecated('webgpuStatesConditionalUpload', 'webgpu.statesConditionalUpload');
  if (source.webgpuForceStatesUpload !== undefined)
    warnDeprecated('webgpuForceStatesUpload', 'webgpu.forceStatesUpload');
  if (source.webgpuBatchedSubmit !== undefined)
    warnDeprecated('webgpuBatchedSubmit', 'webgpu.batchedSubmit');
  if (source.webgpuReadbackMode !== undefined)
    warnDeprecated('webgpuReadbackMode', 'webgpu.readbackMode');
  if (source.webgpuOutputBufferReuse !== undefined)
    warnDeprecated('webgpuOutputBufferReuse', 'webgpu.outputBufferReuse');

  const keyframe: NonNullable<MotionAppConfig['keyframe']> = {
    ...(source.keyframe ?? {}),
  };
  if (source.keyframePreprocess !== undefined && keyframe.preprocess === undefined) {
    keyframe.preprocess = source.keyframePreprocess;
  }
  if (source.keyframeSearchOptimized !== undefined && keyframe.searchOptimized === undefined) {
    keyframe.searchOptimized = source.keyframeSearchOptimized;
  }
  if (source.keyframeEntryExpandOnGPU !== undefined && keyframe.entryExpandOnGPU === undefined) {
    keyframe.entryExpandOnGPU = source.keyframeEntryExpandOnGPU;
  }
  if (source.keyframeSearchIndexed !== undefined && keyframe.searchIndexed === undefined) {
    keyframe.searchIndexed = source.keyframeSearchIndexed;
  }
  if (
    source.keyframeSearchIndexedMinKeyframes !== undefined &&
    keyframe.searchIndexedMinKeyframes === undefined
  ) {
    keyframe.searchIndexedMinKeyframes = source.keyframeSearchIndexedMinKeyframes;
  }
  if (source.timelineFlat !== undefined && keyframe.timelineFlat === undefined) {
    keyframe.timelineFlat = source.timelineFlat;
  }

  const debug: NonNullable<MotionAppConfig['debug']> = {
    ...(source.debug ?? {}),
  };
  if (source.debugWebGPUIO !== undefined && debug.webgpuIO === undefined) {
    debug.webgpuIO = source.debugWebGPUIO;
  }
  if (source.physicsValidation !== undefined && debug.physicsValidation === undefined) {
    debug.physicsValidation = source.physicsValidation;
  }

  const webgpu: NonNullable<MotionAppConfig['webgpu']> = {
    ...(source.webgpu ?? {}),
  };
  if (source.webgpuCulling !== undefined && webgpu.culling === undefined) {
    webgpu.culling = source.webgpuCulling;
  }
  if (
    source.webgpuStatesConditionalUpload !== undefined &&
    webgpu.statesConditionalUpload === undefined
  ) {
    webgpu.statesConditionalUpload = source.webgpuStatesConditionalUpload;
  }
  if (source.webgpuForceStatesUpload !== undefined && webgpu.forceStatesUpload === undefined) {
    webgpu.forceStatesUpload = source.webgpuForceStatesUpload;
  }
  if (source.webgpuBatchedSubmit !== undefined && webgpu.batchedSubmit === undefined) {
    webgpu.batchedSubmit = source.webgpuBatchedSubmit;
  }
  if (source.webgpuReadbackMode !== undefined && webgpu.readbackMode === undefined) {
    webgpu.readbackMode = source.webgpuReadbackMode;
  }
  if (source.webgpuOutputBufferReuse !== undefined && webgpu.outputBufferReuse === undefined) {
    webgpu.outputBufferReuse = source.webgpuOutputBufferReuse;
  }

  return {
    ...source,
    keyframe: Object.keys(keyframe).length > 0 ? keyframe : undefined,
    debug: Object.keys(debug).length > 0 ? debug : undefined,
    webgpu: Object.keys(webgpu).length > 0 ? webgpu : undefined,
  };
}

export interface EngineServices {
  world: import('./world').World;
  scheduler: import('../scheduler/scheduler').SystemScheduler;
  app: MotionApp;
  config: NormalizedMotionAppConfig;
  batchProcessor: import('../systems/batch').ComputeBatchProcessor;
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
