import { World, ComponentDef, SystemDef, RendererDef } from './index';
import { registerEasingWithWGSL } from './systems/easing-registry';
import { createDebugger } from '@g-motion/utils';
import { MotionApp, MotionAppConfig } from './plugin';

const debug = createDebugger('Core');

// App facade implementing MotionApp interface
export class App implements MotionApp {
  private config: MotionAppConfig;
  private renderers = new Map<string, RendererDef>();
  private easings = new Map<string, (t: number) => number>();

  constructor(
    private world: World,
    config: MotionAppConfig = {},
  ) {
    this.config = {
      webgpuThreshold: 1000,
      gpuCompute: 'auto',
      gpuEasing: true,
      ...config,
    };

    // Validate gpuCompute mode if provided
    if (this.config.gpuCompute && !['auto', 'always', 'never'].includes(this.config.gpuCompute)) {
      throw new Error(
        `Invalid gpuCompute mode: ${this.config.gpuCompute}. Must be 'auto', 'always', or 'never'.`,
      );
    }
  }

  registerComponent(name: string, definition: ComponentDef): void {
    // Validate component name
    if (!name || typeof name !== 'string') {
      throw new TypeError(
        `[Motion] Component name must be a non-empty string, got: ${typeof name}`,
      );
    }

    // Check for duplicate registration
    if (this.world.registry.has(name)) {
      throw new Error(
        `[Motion] Component '${name}' is already registered. ` +
          `Consider using a unique namespace or unregister first.`,
      );
    }

    this.world.registry.register(name, definition);
    debug('Registered component', name);
  }

  registerSystem(system: SystemDef): void {
    this.world.scheduler.add(system);
    debug('Registered system', (system as any).name ?? 'anonymous');
  }

  registerRenderer(name: string, renderer: RendererDef): void {
    // Validate renderer name
    if (!name || typeof name !== 'string') {
      throw new TypeError(`[Motion] Renderer name must be a non-empty string, got: ${typeof name}`);
    }

    // Check for duplicate registration
    if (this.renderers.has(name)) {
      throw new Error(
        `[Motion] Renderer '${name}' is already registered. ` +
          `Use a different name or call unregisterRenderer('${name}') first.`,
      );
    }

    // Validate renderer implements update method
    if (typeof renderer.update !== 'function') {
      throw new TypeError(
        `[Motion] Renderer '${name}' must implement update(entityId, target, components) method`,
      );
    }

    this.renderers.set(name, renderer);
    debug('Registered renderer', name);
  }

  registerEasing(name: string, fn: (t: number) => number): void {
    this.easings.set(name, fn);
    debug('Registered easing', name);
  }

  registerGpuEasing(name: string, fn: (t: number) => number, wgslFn: string): void {
    this.easings.set(name, fn);
    registerEasingWithWGSL(name, fn, wgslFn);
    debug('Registered GPU easing', name);
  }

  getConfig(): MotionAppConfig {
    return this.config;
  }

  getRenderer(name: string): RendererDef | undefined {
    return this.renderers.get(name);
  }

  getEasing(name: string): ((t: number) => number) | undefined {
    return this.easings.get(name);
  }
}

export const app = new App(World.get());

// Register built-in renderers
app.registerRenderer('callback', {
  update(_entity: number, target: any, components: any) {
    const props = components.Render?.props;
    if (!props) return;

    if (target.onUpdate) {
      // If there's a single property, pass it directly
      if (Object.keys(props).length === 1) {
        const value = Object.values(props)[0];
        target.onUpdate(value);
      } else {
        target.onUpdate(props);
      }
    }
  },
});

app.registerRenderer('primitive', {
  update(_entity: number, target: any, components: any) {
    const props = components.Render?.props;
    if (!props) return;

    if (props.__primitive !== undefined) {
      target.value = props.__primitive;
      if (target.onUpdate) {
        target.onUpdate(props.__primitive);
      }
    }
  },
});

app.registerRenderer('object', {
  update(_entity: number, target: any, components: any) {
    const props = components.Render?.props;
    if (!props) return;

    Object.assign(target, props);
  },
});
