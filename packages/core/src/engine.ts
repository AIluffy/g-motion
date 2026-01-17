import { App, app as globalApp, appWorld, registerBuiltInRenderers } from './app';
import { getAppContext } from './context';
import { getGPUMetricsProvider } from './webgpu/metrics-provider';
import { getWebGPUBufferManager } from './webgpu/buffer';
import { clearPipelineCache } from './systems/webgpu';
import { World } from './world';
import { WorldProvider } from './worldProvider';
import type { SystemScheduler } from './scheduler';
import type { EngineServices, MotionApp, MotionAppConfig, MotionPlugin } from './plugin';
import { getRegisteredPlugins } from './plugin';

export interface MotionEngine {
  readonly services: EngineServices;
  readonly world: World;
  readonly scheduler: SystemScheduler;
  readonly app: MotionApp;
  readonly disposed: boolean;

  use(plugin: MotionPlugin): void;
  dispose(): void;
  reset(options?: EngineResetOptions): void;
}

export interface EngineResetOptions {
  soft?: boolean;
  configOverride?: MotionAppConfig;
}

class MotionEngineImpl implements MotionEngine {
  readonly world: World;
  readonly scheduler: SystemScheduler;
  readonly app: MotionApp;
  readonly services: EngineServices;
  private _disposed = false;

  constructor(world: World, appOverride?: MotionApp) {
    this.world = world;
    this.scheduler = this.world.scheduler;
    this.app = appOverride ?? new App(this.world, this.world.config);
    if (!appOverride) {
      registerBuiltInRenderers(this.app as App);
    }

    const appContext = getAppContext();
    const batchProcessor = appContext.getBatchProcessor();
    const metrics = getGPUMetricsProvider();
    const errorHandler = appContext.getErrorHandler();

    this.services = {
      world: this.world,
      scheduler: this.scheduler,
      app: this.app,
      config: this.world.config,
      batchProcessor,
      metrics,
      errorHandler,
      appContext,
    };

    this.scheduler.setServices(this.services);
  }

  get disposed(): boolean {
    return this._disposed;
  }

  use(plugin: MotionPlugin): void {
    if (plugin.manifest) {
      const manifest = plugin.manifest;

      if (manifest.components) {
        for (const [name, def] of Object.entries(manifest.components)) {
          if (!this.world.registry.has(name)) {
            this.app.registerComponent(name, { schema: def.schema });
          }
        }
      }

      if (manifest.systems) {
        const existingSystems = this.world.scheduler['systems'] as Array<{ name: string }>;
        for (const system of manifest.systems) {
          if (!existingSystems || !existingSystems.some((s) => s.name === system.name)) {
            this.app.registerSystem(system);
          }
        }
      }

      if (manifest.shaders) {
        const shaderRegistry = (this.services.appContext as any)['shaderRegistry'];
        for (const [name, shaderDef] of Object.entries(manifest.shaders)) {
          if (!shaderRegistry || !shaderRegistry.has(name)) {
            this.app.registerShader({
              name,
              code: shaderDef.code,
              entryPoint: shaderDef.entryPoint,
              bindings: shaderDef.bindings,
            });
          }
        }
      }

      manifest.setup?.(this.app, this.services);
    } else {
      plugin.setup?.(this.app, this.services);
    }
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this.scheduler.stop();
    this.scheduler.clearServices();

    try {
      this.services.batchProcessor.clear();
    } catch {}

    try {
      getWebGPUBufferManager().clear();
    } catch {}

    try {
      getGPUMetricsProvider().clear();
    } catch {}

    try {
      clearPipelineCache();
    } catch {}

    try {
      this.services.appContext.dispose();
    } catch {}
  }

  reset(options?: EngineResetOptions): void {
    if (this._disposed) {
      return;
    }

    const soft = options?.soft ?? true;
    if (!soft) {
      this.dispose();
      return;
    }

    if (options?.configOverride) {
      const merged = Object.assign({}, this.services.config, options.configOverride);
      this.world.setConfig(merged);
      this.services.config = this.world.config;
    }

    this.world.resetState();
    this.scheduler.clearServices();
    this.scheduler.setServices(this.services);

    try {
      this.services.batchProcessor.clear();
    } catch {}

    try {
      getWebGPUBufferManager().clear();
    } catch {}

    try {
      getGPUMetricsProvider().clear();
    } catch {}

    try {
      clearPipelineCache();
    } catch {}

    try {
      this.services.appContext.dispose();
    } catch {}

    this.services.batchProcessor = this.services.appContext.getBatchProcessor();
    this.services.errorHandler = this.services.appContext.getErrorHandler();
  }
}

export function createEngine(config?: MotionAppConfig): MotionEngine {
  const world = World.create(config);
  return getEngineForWorld(world);
}

const engineByWorld = new WeakMap<World, MotionEngine>();

export function getDefaultEngine(config?: MotionAppConfig): MotionEngine {
  const world = WorldProvider.useWorld();
  const existing = engineByWorld.get(world);
  if (existing) {
    if (config) {
      existing.reset({ soft: true, configOverride: config });
    }
    return existing;
  }
  if (config) {
    world.setConfig(Object.assign({}, world.config, config));
  }
  return getEngineForWorld(world);
}

export function getEngineForWorld(world: World): MotionEngine {
  const existing = engineByWorld.get(world);
  if (existing) return existing;

  const appOverride = world === appWorld ? globalApp : undefined;
  const engine = new MotionEngineImpl(world, appOverride);
  engineByWorld.set(world, engine);

  // Auto-apply registered plugins (for auto-discovery)
  const registeredPlugins = getRegisteredPlugins();
  for (const plugin of registeredPlugins) {
    engine.use(plugin);
  }

  return engine;
}
