import { panic, registerGpuEasing } from '@g-motion/shared';
import { createDebugger } from '@g-motion/shared';
import { getAppContext } from './context';
import type { ComponentDef, RendererDef, ShaderDef, SystemDef } from './plugin';
import { MotionApp, MotionAppConfig } from './plugin';
import { getRendererCode } from './renderer-code';
import type { World } from './world';
import { WorldProvider } from './worldProvider';

const debug = createDebugger('Core');

export { getRendererCode, getRendererName } from './renderer-code';

// App facade implementing MotionApp interface
export class App implements MotionApp {
  private renderers = new Map<string, RendererDef>();

  constructor(
    private world: World,
    config: MotionAppConfig = {},
  ) {
    if (config && Object.keys(config).length > 0) {
      this.world.setConfig({
        ...this.world.config,
        ...config,
      });
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
      panic(
        `[Motion] Component '${name}' is already registered. Consider using a unique namespace or unregister first.`,
        { componentName: name },
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

    getRendererCode(name);

    this.renderers.set(name, renderer);
    debug('Registered renderer', name);
  }

  /**
   * Register a custom easing for GPU computation.
   * The function name is extracted from the WGSL.
   *
   * @param wgslFn - Full WGSL function definition (e.g., 'fn myEase(t: f32) -> f32 { return t * t; }')
   * @returns The registered easing name
   */
  registerGpuEasing(wgslFn: string): string {
    const name = registerGpuEasing(wgslFn);
    debug('Registered GPU easing', name);
    return name;
  }

  registerShader(shader: ShaderDef): void {
    const registry = getAppContext().getShaderRegistry();
    registry.set(shader.name, shader);
    debug('Registered shader', shader.name);
  }

  getConfig(): MotionAppConfig {
    return this.world.config;
  }

  getRenderer(name: string): RendererDef | undefined {
    return this.renderers.get(name);
  }
}

export function registerBuiltInRenderers(app: App): void {
  function callUpdateFn(fn: ((val: any) => void) | undefined, props: Record<string, any>): void {
    if (!fn) return;

    let firstKey: string | undefined;
    for (const k in props) {
      if (Object.prototype.hasOwnProperty.call(props, k)) {
        if (firstKey === undefined) {
          firstKey = k;
          continue;
        }
        fn(props);
        return;
      }
    }

    if (firstKey === undefined) return;
    fn(props[firstKey]);
  }

  function applyPropsToTarget(target: any, props: Record<string, any>): void {
    if (
      target &&
      typeof target === 'object' &&
      typeof target.set === 'function' &&
      typeof target.get === 'function'
    ) {
      for (const key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          target.set(key, props[key]);
        }
      }
      return;
    }
    Object.assign(target, props);
  }

  app.registerRenderer('callback', {
    update(_entity: number, target: any, components: any) {
      const props = components.Render?.props;
      if (!props) return;

      callUpdateFn(target.onUpdate, props);
    },
    updateWithAccessor(_entity: number, target: any, getComponent: (name: string) => any) {
      const renderComp = getComponent('Render') as { props?: Record<string, unknown> } | undefined;
      const props = renderComp?.props;
      if (!props) return;

      callUpdateFn(target.onUpdate, props);
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
    updateWithAccessor(_entity: number, target: any, getComponent: (name: string) => any) {
      const renderComp = getComponent('Render') as { props?: Record<string, any> } | undefined;
      const props = renderComp?.props;
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
      const renderComp = components.Render as
        | { props?: Record<string, any>; onUpdate?: (val: any) => void }
        | undefined;
      const props = renderComp?.props;
      if (!props) return;

      applyPropsToTarget(target, props);
      callUpdateFn(renderComp?.onUpdate, props);
    },
    updateWithAccessor(_entity: number, target: any, getComponent: (name: string) => any) {
      const renderComp = getComponent('Render') as
        | { props?: Record<string, any>; onUpdate?: (val: any) => void }
        | undefined;
      const props = renderComp?.props;
      if (!props) return;

      applyPropsToTarget(target, props);
      callUpdateFn(renderComp?.onUpdate, props);
    },
  });
}

export const appWorld = WorldProvider.useWorld();
export const app = new App(appWorld);

registerBuiltInRenderers(app);
