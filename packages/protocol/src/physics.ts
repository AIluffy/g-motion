/**
 * Shared physics animation contract types.
 */

/**
 * Spring animation options.
 */
export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
  initialVelocity?: number;
}

/**
 * Inertia animation options.
 */
export interface InertiaOptions {
  velocity?: number | 'auto' | (() => number);
  velocitySource?: (track: string, ctx: { target: unknown }) => number;

  min?: number;
  max?: number;
  bounds?: { min?: number; max?: number };

  clamp?: boolean;
  deceleration?: number;
  resistance?: number;
  duration?: number | { min: number; max: number };
  bounce?: false | { stiffness?: number; damping?: number; mass?: number };
  restSpeed?: number;
  restDelta?: number;
}

/**
 * Spring component data.
 */
export interface SpringComponentData {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
}

/**
 * Inertia component data.
 */
export interface InertiaComponentData {
  timeConstant?: number;
  min?: number;
  max?: number;
  bounds?: { min?: number; max?: number };
  clamp?: boolean | number;
  bounce?: false | { stiffness?: number; damping?: number; mass?: number };
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
}
