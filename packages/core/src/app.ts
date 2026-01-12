import type { ComponentDef, SystemDef, RendererDef } from './plugin';
import { registerEasingWithWGSL } from './systems/easing-registry';
import { createDebugger } from '@g-motion/utils';
import { MotionApp, MotionAppConfig } from './plugin';
import { WorldProvider } from './worldProvider';
import { getRendererCode } from './renderer-code';
import type { World } from './world';
import { ErrorCode, ErrorSeverity, MotionError } from './errors';

const debug = createDebugger('Core');

export { getRendererCode, getRendererName } from './renderer-code';

// App facade implementing MotionApp interface
export class App implements MotionApp {
  private renderers = new Map<string, RendererDef>();
  private easings = new Map<string, (t: number) => number>();

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
      throw new MotionError(
        `[Motion] Component '${name}' is already registered. Consider using a unique namespace or unregister first.`,
        ErrorCode.DUPLICATE_REGISTRATION,
        ErrorSeverity.FATAL,
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
    return this.world.config;
  }

  getRenderer(name: string): RendererDef | undefined {
    return this.renderers.get(name);
  }

  getEasing(name: string): ((t: number) => number) | undefined {
    return this.easings.get(name);
  }
}

export function registerBuiltInRenderers(app: App): void {
  app.registerRenderer('callback', {
    update(_entity: number, target: any, components: any) {
      const props = components.Render?.props;
      if (!props) return;

      if (target.onUpdate) {
        if (Object.keys(props).length === 1) {
          const componentValue = Object.values(props)[0];
          target.onUpdate(componentValue);
        } else {
          target.onUpdate(props);
        }
      }
    },
    updateWithAccessor(_entity: number, target: any, getComponent: (name: string) => any) {
      const renderComp = getComponent('Render') as { props?: Record<string, unknown> } | undefined;
      const props = renderComp?.props;
      if (!props) return;

      if (target.onUpdate) {
        if (Object.keys(props).length === 1) {
          const componentValue = Object.values(props)[0];
          target.onUpdate(componentValue);
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

      if (
        target &&
        typeof target === 'object' &&
        typeof (target as any).set === 'function' &&
        typeof (target as any).get === 'function'
      ) {
        for (const [key, value] of Object.entries(props)) {
          (target as any).set(key, value as any);
        }
      } else {
        Object.assign(target, props);
      }

      if (renderComp?.onUpdate) {
        if (Object.keys(props).length === 1) {
          const value = Object.values(props)[0];
          renderComp.onUpdate(value);
        } else {
          renderComp.onUpdate(props);
        }
      }
    },
    updateWithAccessor(_entity: number, target: any, getComponent: (name: string) => any) {
      const renderComp = getComponent('Render') as
        | { props?: Record<string, any>; onUpdate?: (val: any) => void }
        | undefined;
      const props = renderComp?.props;
      if (!props) return;

      if (
        target &&
        typeof target === 'object' &&
        typeof (target as any).set === 'function' &&
        typeof (target as any).get === 'function'
      ) {
        for (const [key, value] of Object.entries(props)) {
          (target as any).set(key, value as any);
        }
      } else {
        Object.assign(target, props);
      }

      if (renderComp?.onUpdate) {
        if (Object.keys(props).length === 1) {
          const value = Object.values(props)[0];
          renderComp.onUpdate(value);
        } else {
          renderComp.onUpdate(props);
        }
      }
    },
  });
}

export const appWorld = WorldProvider.useWorld();
export const app = new App(appWorld);

registerBuiltInRenderers(app);
