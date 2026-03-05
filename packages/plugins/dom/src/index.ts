import type { MotionApp, MotionPlugin, TargetResolver } from '@g-motion/protocol';
import { registerTargetResolver } from '@g-motion/protocol';
import { createDebugger, createDomTargetResolver } from '@g-motion/shared';
import { TransformComponent } from './components/transform';
import { createDOMRenderer, DOMRendererConfig } from './render/renderer';

const debugLog = createDebugger('DOM');

export interface DOMPluginOptions {
  /**
   * Configuration for DOM renderer GPU acceleration
   */
  rendererConfig?: DOMRendererConfig;
}

const domTargetResolver: TargetResolver = createDomTargetResolver('dom');

export const createDOMPlugin = (options: DOMPluginOptions = {}): MotionPlugin => ({
  name: 'DOMPlugin',
  version: '0.0.0',
  manifest: {
    setup(appInstance: MotionApp) {
      try {
        appInstance.registerComponent('Transform', TransformComponent);
      } catch (err) {
        if (
          !(err instanceof Error) ||
          !err.message.includes("Component 'Transform' is already registered")
        ) {
          throw err;
        }
      }
      debugLog('Transform component registered');

      try {
        appInstance.registerRenderer('dom', createDOMRenderer(options.rendererConfig));
      } catch (err) {
        if (
          !(err instanceof Error) ||
          !err.message.includes("Renderer 'dom' is already registered")
        ) {
          throw err;
        }
      }
      debugLog("Renderer 'dom' registered with GPU acceleration:", options.rendererConfig);

      if (typeof registerTargetResolver === 'function') {
        registerTargetResolver(domTargetResolver);
      }
    },
  },
});

// Default plugin instance with optimal GPU settings
export const DOMPlugin: MotionPlugin = createDOMPlugin();

export * from './components/transform';
export * from './render/renderer';
