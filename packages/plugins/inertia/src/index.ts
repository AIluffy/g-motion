import { MotionPlugin, MotionApp, app } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { InertiaComponent } from './component';
import { InertiaSystem } from './inertia-system';

const debugLog = createDebugger('Inertia');

export const InertiaPlugin: MotionPlugin = {
  name: 'InertiaPlugin',
  version: '0.0.0',
  setup(appInstance: MotionApp) {
    // Register Inertia component
    appInstance.registerComponent('Inertia', InertiaComponent);
    debugLog('Inertia component registered');

    // Register Inertia system (runs before InterpolationSystem)
    appInstance.registerSystem(InertiaSystem);
    debugLog('InertiaSystem registered');
  },
};

// Auto-register the Inertia plugin when this module is imported (only in browser environments)
if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
  debugLog('Auto-registering InertiaPlugin');
  InertiaPlugin.setup(app);
}

export * from './component';
export * from './inertia-system';
export * from './velocity-tracker';
