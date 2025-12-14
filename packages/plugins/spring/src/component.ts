import { ComponentDef } from '@g-motion/core';

/**
 * SpringComponent stores spring physics parameters and per-track velocity state.
 * Inspired by Popmotion's spring animation options.
 */
export const SpringComponent: ComponentDef = {
  schema: {
    stiffness: 'float32', // Spring stiffness (default: 100)
    damping: 'float32', // Damping force (default: 10)
    mass: 'float32', // Object mass (default: 1)
    restSpeed: 'float32', // Velocity threshold for completion (default: 10 units/sec)
    restDelta: 'float32', // Distance threshold for completion (default: 0.01)
    velocities: 'object', // Map<string, number> - per-track velocity state
  },
};

/**
 * Spring animation options that can be passed to mark()
 */
export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
}

/**
 * Default spring parameters (matching Popmotion defaults)
 */
export const DEFAULT_SPRING_CONFIG: Required<SpringOptions> = {
  stiffness: 100,
  damping: 10,
  mass: 1,
  restSpeed: 10,
  restDelta: 0.01,
};
