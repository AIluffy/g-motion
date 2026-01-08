/**
 * Centralized type definitions for Motion animation engine.
 * This module consolidates types that were previously scattered across packages.
 */

/**
 * Batch context for tracking per-frame batch processing state
 */
export interface BatchContext {
  lastBatchId?: string;
  entityCount?: number;
  archetypeBatchesReady?: boolean;
  timestamp?: number;
}

/**
 * Built-in easing function names for type-safe string-based easing
 */
export type EasingName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeInCirc'
  | 'easeOutCirc'
  | 'easeInOutCirc'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'easeInElastic'
  | 'easeOutElastic'
  | 'easeInOutElastic'
  | 'easeInBounce'
  | 'easeOutBounce'
  | 'easeInOutBounce';

/**
 * Easing function type: accepts progress [0,1] and returns eased value [0,1]
 */
export type EasingFunction = (t: number) => number;

/**
 * Easing can be specified as:
 * - A string name (type-safe with autocomplete)
 * - A custom function
 */
export type Easing = EasingName | EasingFunction;

/**
 * Physics parameters for spring-based animations
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
 * Inertia animation options (inspired by GSAP InertiaPlugin)
 * Supports both simple velocity values and advanced configuration
 */
export interface InertiaOptions {
  // Velocity (can be number, 'auto' for tracked properties, or function)
  velocity?: number | 'auto' | (() => number);
  /** Optional custom velocity getter for 'auto' mode */
  velocitySource?: (track: string, ctx: { target: any }) => number;

  // Boundary constraints
  min?: number; // Minimum end value
  max?: number; // Maximum end value
  bounds?: { min?: number; max?: number }; // Preferred alias for min/max

  // Clamp instead of bounce when hitting bounds
  clamp?: boolean;

  // End value control (GSAP-inspired snap-to)
  snap?: number | number[] | ((naturalEnd: number) => number); // Preferred name
  end?: number | number[] | ((naturalEnd: number) => number); // Alias for backward compatibility
  snapTo?: number | number[] | ((naturalEnd: number) => number); // Additional alias per spec

  // Deceleration (ms-based). If provided, maps to timeConstant = 1000 / deceleration
  deceleration?: number;

  // Modify target before snap/bounds evaluation
  modifyTarget?: (target: number) => number;

  // Physics parameters
  resistance?: number; // Resistance per second (friction) - more intuitive than timeConstant
  duration?: number | { min: number; max: number }; // Tween duration in seconds or range

  // Legacy parameters (for backward compatibility)
  power?: number; // Target distance factor (deprecated, use resistance instead)
  timeConstant?: number; // Decay duration in ms (deprecated, use resistance/duration instead)

  // Bounce parameters (when hitting min/max boundaries)
  bounce?: false | { stiffness?: number; damping?: number; mass?: number }; // Preferred form; false disables bounce
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
 * Represents a single keyframe in an animation timeline
 */
export interface Keyframe {
  startTime: number;
  time: number; // Absolute time when this keyframe ends (0 to time is the duration of change)
  startValue: number; // For now assumes number, will need generic for color/string later
  endValue: number;
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier' | 'spring' | 'inertia';
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  easing?: Easing; // String name or custom function
  spring?: SpringOptions; // Spring physics parameters
  inertia?: InertiaOptions; // Inertia physics parameters
}

/**
 * Array of keyframes for a single property track
 */
export type Track = Keyframe[];

/**
 * Timeline data structure: maps property names to their keyframe tracks
 */
export type TimelineData = Map<string, Track>;

/**
 * Transform component for spatial animations
 */
export interface TransformData {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  scale?: number;
  rotate?: number;
  translateX?: number;
  translateY?: number;
}

/**
 * Render component for storing interpolated values
 */
export interface RenderData {
  rendererId: string;
  rendererCode?: number;
  target: any;
  props?: Record<string, number>;
  version?: number;
  renderedVersion?: number;
}

/**
 * Motion state component for tracking animation progress
 */
export interface MotionStateData {
  status: number; // MotionStatus enum
  startTime: number;
  currentTime: number;
  playbackRate: number;
  iteration?: number;
}

/**
 * Velocity tracking data for inertia/momentum animations
 */
export interface VelocityData {
  values: number[];
  timestamps: number[];
  velocity: number;
  rafId?: number;
}
/**
 * Per-archetype batch descriptor for GPU processing
 * Supports per-archetype segmented buffers with adaptive workgroup sizing
 */
export interface ArchetypeBatchDescriptor {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  entityCount: number;
  entityIdsLeaseId?: number;
  statesData: Float32Array; // Flat: [st₀, ct₀, pr₀, s₀, st₁, ct₁, pr₁, s₁, ...]
  keyframesData: Float32Array; // Flat: [t₀, dur₀, sv₀, ev₀, eid₀, ...]
  keyframesVersion?: number; // P0-2: Version signature for fast change detection
  workgroupHint: number; // 16, 32, 64, or 128 (adaptive based on entity count)
  preprocessedKeyframes?: {
    rawKeyframesPerEntity: Float32Array[];
    channelMapPerEntity: Uint32Array[];
  };
  kind?: 'interpolation' | 'physics';
  physics?: {
    baseArchetypeId: string;
    stride: number;
    channels: Array<{ index: number; property: string }>;
    slotCount: number;
    stateData?: Float32Array;
    stateVersion?: number;
  };
  // Optional GPU resources (managed by WebGPUComputeSystem)
  gpuBuffers?: {
    statesBuffer: any; // GPUBuffer
    keyframesBuffer: any; // GPUBuffer
    outputBuffer: any; // GPUBuffer
  };
  bindGroup?: any; // GPUBindGroup
  createdAt: number;
}

/**
 * GPU batch context with per-archetype batch information
 */
export interface GPUBatchContextWithArchetypes {
  archetypeBatches: Map<string, ArchetypeBatchDescriptor>;
  timestamp: number;
  archetypeBatchesReady?: boolean;
}
