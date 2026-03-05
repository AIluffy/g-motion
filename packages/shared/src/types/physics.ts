/**
 * @deprecated Please import physics types from @g-motion/plugin-spring or @g-motion/plugin-inertia.
 */

/**
 * @deprecated Please import from @g-motion/plugin-spring.
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
 * @deprecated Please import from @g-motion/plugin-inertia.
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
 * @deprecated Please import from @g-motion/plugin-spring.
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
 * @deprecated Please import from @g-motion/plugin-inertia.
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
