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

/**
 * Inertia animation options that can be passed to mark()
 * Inspired by GSAP InertiaPlugin with snap-to and advanced controls
 */
export interface InertiaOptions {
  // Velocity (can be number, 'auto' for tracked properties, or function)
  velocity?: number | 'auto' | (() => number);
  velocitySource?: (track: string, ctx: { target: any }) => number; // Custom getter for 'auto'

  // Boundary constraints
  min?: number; // Minimum end value
  max?: number; // Maximum end value
  bounds?: { min?: number; max?: number };
  clamp?: boolean; // Clamp instead of bounce

  // End value control (GSAP-inspired snap-to)
  snap?: number | number[] | ((naturalEnd: number) => number); // Preferred
  end?: number | number[] | ((naturalEnd: number) => number); // Alias
  modifyTarget?: (target: number) => number; // Transform natural end before snap/bounds

  // Physics parameters
  resistance?: number; // Resistance per second (friction) - more intuitive than timeConstant
  duration?: number | { min: number; max: number }; // Tween duration in seconds or range

  // Legacy parameters (for backward compatibility)
  power?: number; // Target distance factor (deprecated, use resistance instead)
  timeConstant?: number; // Decay duration in ms (deprecated, use resistance/duration instead)

  // Bounce parameters (when hitting min/max boundaries)
  bounce?: false | { stiffness?: number; damping?: number; mass?: number }; // Preferred
  bounceStiffness?: number; // Legacy stiffness
  bounceDamping?: number; // Legacy damping
  bounceMass?: number; // Legacy mass

  // Optional handoff into spring when decay/bounce completes
  handoff?: { type: 'spring'; to?: number };

  // Completion thresholds
  restSpeed?: number; // Velocity threshold for completion (default: 0.5 units/sec)
  restDelta?: number; // Distance threshold for completion (default: 0.5)
}

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
