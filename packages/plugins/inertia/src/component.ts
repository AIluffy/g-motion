import { ComponentDef } from '@g-motion/core';

/**
 * InertiaComponent stores inertia physics parameters and per-track state.
 * Inspired by Popmotion's inertia animation options.
 *
 * Inertia simulates momentum-based motion with exponential decay,
 * and optional boundary bounce using spring physics.
 */
export const InertiaComponent: ComponentDef = {
  schema: {
    power: 'float32', // Target distance factor (default: 0.8)
    timeConstant: 'float32', // Decay duration in ms (default: 350)
    min: 'float32', // Minimum boundary (optional)
    max: 'float32', // Maximum boundary (optional)
    bounds: 'object', // Preferred bounds bag { min, max }
    clamp: 'int32', // 0/1 clamp instead of bounce
    snap: 'object', // Preferred snap target (alias of end)
    end: 'object', // Snap target: number, number[], or function - stored as object
    modifyTarget: 'object', // Optional transform of natural end before snap/bounds
    bounceStiffness: 'float32', // Spring stiffness for boundary bounce (default: 500)
    bounceDamping: 'float32', // Spring damping for boundary bounce (default: 10)
    bounceMass: 'float32', // Mass for boundary bounce (default: 1.0)
    bounce: 'object', // Preferred bounce config or false
    handoff: 'object', // Optional handoff configuration
    restSpeed: 'float32', // Velocity threshold for completion (default: 0.5 units/sec)
    restDelta: 'float32', // Distance threshold for completion (default: 0.5)
    velocities: 'object', // Map<string, number> - per-track velocity state
    bounceVelocities: 'object', // Map<string, number> - per-track bounce velocity
    inBounce: 'object', // Map<string, boolean> - per-track bounce state
  },
};

export type { InertiaOptions } from '@g-motion/core';

/**
 * Default inertia parameters
 */
export const DEFAULT_INERTIA_CONFIG = {
  resistance: 100, // Default resistance (pixels/second²)
  power: 0.8, // Legacy fallback
  timeConstant: 350, // Legacy fallback
  bounceStiffness: 500,
  bounceDamping: 10,
  bounceMass: 1.0,
  restSpeed: 0.5,
  restDelta: 0.5,
};
