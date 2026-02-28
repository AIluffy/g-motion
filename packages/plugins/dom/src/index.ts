import type { MotionApp, MotionPlugin } from '@g-motion/core';
import { createDebugger, createDomTargetResolver } from '@g-motion/shared';
import { registerTargetResolver, TargetResolver, TargetType } from '@g-motion/animation';
import { TransformComponent } from './components/transform';
import { createDOMRenderer, DOMRendererConfig } from './renderer';

const debugLog = createDebugger('DOM');

export interface DOMPluginOptions {
  /**
   * Configuration for DOM renderer GPU acceleration
   */
  rendererConfig?: DOMRendererConfig;
}

const domTargetResolver: TargetResolver = createDomTargetResolver(TargetType.DOM);

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
export * from './renderer';
