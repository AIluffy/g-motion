/**
 * Centralized type definitions for Motion animation engine.
 * This module consolidates types that were previously scattered across packages.
 */

export type ComponentValue = Record<string, unknown>;

export type ComponentType = 'float32' | 'float64' | 'int32' | 'string' | 'object';

export interface ComponentDef {
  schema: Record<string, ComponentType>;
}

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
 * Easing for mark options.
 * - Built-in names (e.g., 'easeInOut', 'linear')
 * - Custom easings registered via app.registerGpuEasing()
 */
export type Easing = string;

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

export class TimelineTracksMap extends Map<string, Track> {
  readonly flatKeys: string[] = [];
  readonly flatValues: Track[] = [];
  private readonly indexByKey = new Map<string, number>();

  constructor(entries?: Iterable<readonly [string, Track]> | null) {
    super();
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  override set(key: string, value: Track): this {
    const existingIndex = this.indexByKey.get(key);
    if (existingIndex === undefined) {
      this.flatKeys.push(key);
      this.flatValues.push(value);
      this.indexByKey.set(key, this.flatKeys.length - 1);
    } else {
      this.flatValues[existingIndex] = value;
    }
    return super.set(key, value);
  }

  override delete(key: string): boolean {
    const existingIndex = this.indexByKey.get(key);
    const didDelete = super.delete(key);
    if (!didDelete || existingIndex === undefined) {
      return didDelete;
    }

    this.flatKeys.splice(existingIndex, 1);
    this.flatValues.splice(existingIndex, 1);
    this.indexByKey.delete(key);
    for (let i = existingIndex; i < this.flatKeys.length; i++) {
      this.indexByKey.set(this.flatKeys[i], i);
    }
    return true;
  }

  override clear(): void {
    super.clear();
    this.flatKeys.length = 0;
    this.flatValues.length = 0;
    this.indexByKey.clear();
  }
}

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
  target: unknown;
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
  delay?: number;
  pausedAt?: number;
  tickInterval?: number;
  tickPhase?: number;
  tickPriority?: number;
}

export interface TimelineComponentData {
  tracks?: TimelineData;
  duration?: number;
  loop?: number | boolean;
  repeat?: number;
  version?: number;
  rovingApplied?: number;
}

export interface SpringComponentData {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
}

export interface InertiaComponentData {
  power?: number;
  timeConstant?: number;
  min?: number;
  max?: number;
  bounds?: { min?: number; max?: number };
  clamp?: boolean | number;
  snap?: unknown;
  end?: unknown;
  modifyTarget?: unknown;
  bounce?: unknown | false;
  bounceStiffness?: number;
  bounceDamping?: number;
  bounceMass?: number;
  handoff?: unknown;
  restSpeed?: number;
  restDelta?: number;
  velocities?: Map<string, number>;
  bounceVelocities?: Map<string, number>;
  inBounce?: Map<string, boolean>;
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
export type PreprocessedKeyframes = {
  rawKeyframesPerEntity: Float32Array[];
  channelMapPerEntity: Uint32Array[];
  clipModel?: {
    rawKeyframesByClip: Float32Array[];
    channelMapByClip: Uint32Array[];
    clipIndexByEntity: Uint32Array;
  };
};

export interface BatchDescriptor {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  entityCount: number;
}

export interface LeasedBatchDescriptor extends BatchDescriptor {
  entityIdsLeaseId?: number;
}

export interface WorkgroupBatchDescriptor extends LeasedBatchDescriptor {
  workgroupHint: number;
}

export interface GPUBatchDescriptor extends WorkgroupBatchDescriptor {
  statesData: Float32Array;
  keyframesData: Float32Array;
  statesVersion?: number;
  keyframesVersion?: number;
  entitySig?: number;
  preprocessedKeyframes?: PreprocessedKeyframes;
  gpuBuffers?: {
    statesBuffer: any;
    keyframesBuffer: any;
    outputBuffer: any;
  };
  bindGroup?: any;
  createdAt: number;
  kind?: 'interpolation';
}

export interface PhysicsBatchDescriptor extends WorkgroupBatchDescriptor {
  kind: 'physics';
  physics: {
    baseArchetypeId: string;
    stride: number;
    channels: Array<{ index: number; property: string }>;
    slotCount: number;
    stateData?: Float32Array;
    stateVersion?: number;
  };
  createdAt: number;
  statesData?: Float32Array;
  keyframesData?: Float32Array;
  keyframesVersion?: number;
  preprocessedKeyframes?: PreprocessedKeyframes;
  gpuBuffers?: {
    statesBuffer: any;
    keyframesBuffer: any;
    outputBuffer: any;
  };
  bindGroup?: any;
}

export type ArchetypeBatchDescriptor = GPUBatchDescriptor | PhysicsBatchDescriptor;

export type KeyframePreprocessBatchDescriptor = {
  archetypeId: string;
  preprocessedKeyframes: PreprocessedKeyframes;
  keyframesVersion?: number;
};

export type GPUBatchWithPreprocessedKeyframes = GPUBatchDescriptor & {
  preprocessedKeyframes: PreprocessedKeyframes;
};

export interface ViewportCullingBatchDescriptor extends LeasedBatchDescriptor {
  statesData: Float32Array;
}

/**
 * GPU batch context with per-archetype batch information
 */
export interface GPUBatchContextWithArchetypes {
  archetypeBatches: Map<string, ArchetypeBatchDescriptor>;
  timestamp: number;
  archetypeBatchesReady?: boolean;
}
