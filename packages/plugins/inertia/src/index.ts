import { MotionPlugin, MotionApp } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { InertiaComponent } from './component';
import { InertiaSystem } from './inertia-system';

const debugLog = createDebugger('Inertia');

export const InertiaPlugin: MotionPlugin = {
  name: 'InertiaPlugin',
  version: '0.0.0',
  setup(appInstance: MotionApp, _services?: unknown) {
    // Register Inertia component
    try {
      appInstance.registerComponent('Inertia', InertiaComponent);
    } catch (err) {
      if (
        !(err instanceof Error) ||
        !err.message.includes("Component 'Inertia' is already registered")
      ) {
        throw err;
      }
    }
    debugLog('Inertia component registered');

    // Register Inertia system (runs before InterpolationSystem)
    appInstance.registerSystem(InertiaSystem);
    debugLog('InertiaSystem registered');
  },
};

export * from './component';
export * from './inertia-system';
export * from './velocity-tracker';
