import type { ComponentDef } from '@g-motion/protocol';

/**
 * InertiaComponent schema for plugin registration
 */
export const InertiaComponentSchema: ComponentDef['schema'] = {
  timeConstant: 'float32',
  min: 'float32',
  max: 'float32',
  bounds: 'object',
  clamp: 'int32',
  bounce: 'object',
  restSpeed: 'float32',
  restDelta: 'float32',
  velocities: 'object',
};

/**
 * InertiaComponent stores inertia physics parameters and per-track state.
 * Inspired by Popmotion's inertia animation options.
 *
 * Inertia simulates momentum-based motion with exponential decay,
 * and optional boundary bounce using spring physics.
 */
export const InertiaComponent: ComponentDef = {
  schema: InertiaComponentSchema,
};

export type { InertiaOptions } from '@g-motion/protocol';
