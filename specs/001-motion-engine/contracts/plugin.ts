// Plugin API Contract
// This defines how extensions interact with the core engine.

export interface MotionPlugin {
  name: string;
  version: string;
  setup(app: MotionApp): void;
}

export interface MotionApp {
  registerComponent(name: string, definition: ComponentDef): void;
  registerSystem(system: SystemDef): void;
  registerRenderer(name: string, renderer: RendererDef): void;
  registerEasing(name: string, fn: (t: number) => number): void;
}

export interface ComponentDef {
  schema: Record<string, 'float32' | 'float64' | 'int32' | 'string'>;
}

export interface SystemDef {
  name: string;
  order: number; // Execution order
  query: string[]; // Components to query
  update(entities: number[], dt: number): void;
}

export interface RendererDef {
  update(entity: number, target: any, components: any): void;
}
