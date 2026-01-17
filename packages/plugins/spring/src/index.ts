import { MotionPlugin, MotionApp } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { SpringComponent } from './component';
import { SpringSystem } from './spring-system';

const debugLog = createDebugger('Spring');

export const SpringPlugin: MotionPlugin = {
  name: 'SpringPlugin',
  version: '0.0.0',
  setup(appInstance: MotionApp, _services?: unknown) {
    // Register Spring component
    try {
      appInstance.registerComponent('Spring', SpringComponent);
    } catch (err) {
      if (
        !(err instanceof Error) ||
        !err.message.includes("Component 'Spring' is already registered")
      ) {
        throw err;
      }
    }
    debugLog('Spring component registered');

    appInstance.registerSystem(SpringSystem);
    debugLog('SpringSystem registered');
  },
};

export * from './component';
export * from './spring-system';
