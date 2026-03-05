import type { ComponentDef } from '@g-motion/protocol';
import type { SpringOptions } from '@g-motion/protocol';

/**
 * SpringComponent stores spring physics parameters and per-track velocity state.
 * Inspired by Popmotion's spring animation options.
 */
export const SpringComponentSchema: ComponentDef['schema'] = {
  stiffness: 'float32',
  damping: 'float32',
  mass: 'float32',
  restSpeed: 'float32',
  restDelta: 'float32',
  velocities: 'object',
};

export const SpringComponent: ComponentDef = {
  schema: SpringComponentSchema,
};

export type { SpringOptions } from '@g-motion/protocol';

/**
 * Default spring parameters (matching Popmotion defaults)
 */
export const DEFAULT_SPRING_CONFIG: Required<Omit<SpringOptions, 'initialVelocity'>> = {
  stiffness: 100,
  damping: 10,
  mass: 1,
  restSpeed: 10,
  restDelta: 0.01,
};

/**
 * Spring preset configurations for common spring behaviors
 */
export const SPRING_PRESETS = {
  /** Gentle spring (slow, smooth) */
  gentle: { stiffness: 100, damping: 20, mass: 1 },
  /** Default spring (balanced) */
  default: { stiffness: 170, damping: 26, mass: 1 },
  /** Wobbly spring (bouncy) */
  wobbly: { stiffness: 180, damping: 12, mass: 1 },
  /** Stiff spring (fast, snappy) */
  stiff: { stiffness: 210, damping: 20, mass: 1 },
  /** Slow spring (very smooth) */
  slow: { stiffness: 280, damping: 60, mass: 1 },
  /** Molasses (very slow) */
  molasses: { stiffness: 280, damping: 120, mass: 1 },
} as const;

/**
 * Calculate critical damping for a spring
 * Critical damping = 2 * sqrt(stiffness * mass)
 */
export function calculateCriticalDamping(stiffness: number, mass: number): number {
  return 2 * Math.sqrt(stiffness * mass);
}
