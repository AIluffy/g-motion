import { MotionPlugin, MotionApp, app } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { SpringComponent } from './component';
import { SpringSystem } from './spring-system';

const debugLog = createDebugger('Spring');

export const SpringPlugin: MotionPlugin = {
  name: 'SpringPlugin',
  version: '0.0.0',
  setup(appInstance: MotionApp) {
    // Register Spring component
    appInstance.registerComponent('Spring', SpringComponent);
    debugLog('Spring component registered');

    // Register Spring system (runs before InterpolationSystem)
    appInstance.registerSystem(SpringSystem);
    debugLog('SpringSystem registered');
  },
};

// Auto-register the Spring plugin when this module is imported (only in browser environments)
if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
  debugLog('Auto-registering SpringPlugin');
  SpringPlugin.setup(app);
}

export * from './component';
export * from './spring-system';
