import type { ComponentDef } from './component';
import type { RendererDef, SystemDef } from './system';
import type { ShaderDef } from './shader';
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
  registerShader(shader: ShaderDef): void;
  getConfig(): Record<string, unknown>;
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
