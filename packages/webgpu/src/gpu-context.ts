import type { GPUChannelMappingRegistry } from './channel-mapping';
import { GPUChannelMappingRegistry as GPUChannelRegistry } from './channel-mapping';
import { setDefaultGPUChannelMappingRegistry } from './channel-mapping';
import type { GPUMetricsProvider } from './metrics-provider';
import { createGPUMetricsProvider, setDefaultGPUMetricsProvider } from './metrics-provider';
import type { WebGPUEngine, WebGPUEngineConfig } from './engine';
import { WebGPUEngine as Engine, setDefaultWebGPUEngine } from './engine';
import type { GPUSyncManager } from './sync-manager';
import { GPUSyncManager as SyncManager, setDefaultGPUSyncManager } from './sync-manager';

export interface GPUContext {
  readonly engine: WebGPUEngine;
  readonly channelRegistry: GPUChannelMappingRegistry;
  readonly metricsProvider: GPUMetricsProvider;
  readonly syncManager: GPUSyncManager;
}

export interface GPUContextConfig {
  engine?: WebGPUEngine;
  engineConfig?: WebGPUEngineConfig;
  channelRegistry?: GPUChannelMappingRegistry;
  metricsProvider?: GPUMetricsProvider;
  syncManager?: GPUSyncManager;
  setAsDefault?: boolean;
}

let defaultContext: GPUContext | null = null;

export function createGPUContext(config: GPUContextConfig = {}): GPUContext {
  const engine = config.engine ?? new Engine(config.engineConfig ?? {});
  const channelRegistry = config.channelRegistry ?? new GPUChannelRegistry();
  const metricsProvider = config.metricsProvider ?? createGPUMetricsProvider();
  const syncManager = config.syncManager ?? new SyncManager();
  const context: GPUContext = {
    engine,
    channelRegistry,
    metricsProvider,
    syncManager,
  };
  if (config.setAsDefault) {
    setDefaultGPUContext(context);
  }
  return context;
}

export function destroyGPUContext(context: GPUContext): void {
  context.syncManager.clear();
  context.channelRegistry.clear();
  context.metricsProvider.clear();
  context.engine.dispose();
}

export function setDefaultGPUContext(context: GPUContext | null): void {
  defaultContext = context;
  setDefaultWebGPUEngine(context?.engine ?? null);
  setDefaultGPUMetricsProvider(context?.metricsProvider ?? null);
  setDefaultGPUChannelMappingRegistry(context?.channelRegistry ?? null);
  setDefaultGPUSyncManager(context?.syncManager ?? null);
}

export function getDefaultGPUContext(): GPUContext {
  if (!defaultContext) {
    defaultContext = createGPUContext({ setAsDefault: true });
  }
  return defaultContext;
}

export function createTestGPUContext(config: GPUContextConfig = {}): GPUContext {
  return createGPUContext({ ...config, setAsDefault: true });
}

export function resetGPUContext(): void {
  if (defaultContext) {
    destroyGPUContext(defaultContext);
  }
  setDefaultGPUContext(null);
  defaultContext = null;
}
