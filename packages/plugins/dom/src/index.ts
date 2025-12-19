import type { MotionApp } from '@g-motion/core';
import { MotionPlugin } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { TransformComponent } from './components/transform';
import { createDOMRenderer, DOMRendererConfig } from './renderer';

const debugLog = createDebugger('DOM');

export interface DOMPluginOptions {
  /**
   * Configuration for DOM renderer GPU acceleration
   */
  rendererConfig?: DOMRendererConfig;
}

export const createDOMPlugin = (options: DOMPluginOptions = {}): MotionPlugin => ({
  name: 'DOMPlugin',
  version: '0.0.0',
  setup(appInstance: MotionApp, _services?: unknown) {
    // Register Transform component
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

    // Register DOM renderer with configuration
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
  },
});

// Default plugin instance with optimal GPU settings
export const DOMPlugin: MotionPlugin = createDOMPlugin();

export * from './components/transform';
export * from './renderer';
