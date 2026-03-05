export interface SpringParams {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
  initialVelocity?: number;
}

export interface InertiaParams {
  velocity?: number | 'auto' | (() => number);
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

export interface SpringComponentData {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
}

/** @deprecated Use SpringParams instead. */
export type SpringOptions = SpringParams;
/** @deprecated Use InertiaParams instead. */
export type InertiaOptions = InertiaParams;

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
