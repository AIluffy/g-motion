import type { ComponentDef } from './component';
import type { RendererDef, SystemDef } from './system';
import type { FrameCallback, Priority } from './types';

export interface EngineLike {
  addUpdateCallback?(cb: (dt: number) => void): () => void;
  getElapsed?(): number;
}

export interface WorldLike {
  getEngine?(): EngineLike;
  onFrame?(cb: FrameCallback, priority?: Priority): { dispose(): void };
}

export interface PluginContext {
  world: WorldLike;
  engine: EngineLike;
}

export interface Plugin {
  name: string;
  install(ctx: PluginContext): void | (() => void);
}

export function definePlugin(name: string, install: Plugin['install']): Plugin {
  return { name, install };
}

export interface MotionApp {
  registerComponent(name: string, def: ComponentDef): void;
  registerSystem(system: SystemDef): void;
  registerRenderer(name: string, renderer: RendererDef): void;
  registerGpuEasing(wgslFn: string): string;
  registerShader(shader: unknown): void;
  getConfig(): unknown;
  getRenderer(name: string): unknown;
}

export interface MotionPlugin {
  name: string;
  version?: string;
  manifest: {
    components?: Record<string, ComponentDef>;
    systems?: SystemDef[];
    shaders?: Record<string, unknown>;
    config?: Record<string, unknown>;
    setup?(app: MotionApp, services?: unknown): void;
  };
}

const pluginRegistry: MotionPlugin[] = [];
const pluginNames = new Set<string>();

export function registerPlugin(plugin: MotionPlugin): boolean {
  if (pluginNames.has(plugin.name)) {
    return false;
  }
  pluginRegistry.push(plugin);
  pluginNames.add(plugin.name);
  return true;
}

export function getRegisteredPlugins(): readonly MotionPlugin[] {
  return pluginRegistry;
}

export function clearPluginRegistry(): void {
  pluginRegistry.length = 0;
  pluginNames.clear();
}

export function isPluginRegistered(pluginName: string): boolean {
  return pluginNames.has(pluginName);
}
