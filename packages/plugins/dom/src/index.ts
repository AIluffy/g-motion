import { MotionPlugin, MotionApp, app } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { TransformComponent } from './components/transform';
import { createDOMRenderer } from './renderer';

const debugLog = createDebugger('DOM');

export const DOMPlugin: MotionPlugin = {
  name: 'DOMPlugin',
  version: '0.0.0',
  setup(appInstance: MotionApp) {
    // Register Transform component
    appInstance.registerComponent('Transform', TransformComponent);
    debugLog('Transform component registered');

    // Register DOM renderer
    appInstance.registerRenderer('dom', createDOMRenderer());
    debugLog("Renderer 'dom' registered");
  },
};

// Auto-register the DOM plugin when this module is imported (only in browser environments)
if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
  debugLog('Auto-registering DOMPlugin');
  DOMPlugin.setup(app);
}

export * from './components/transform';
export * from './renderer';
