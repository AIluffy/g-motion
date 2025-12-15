import {
  World,
  MotionStateComponent,
  TimelineComponent,
  TimelineData,
  RenderComponent,
  MotionStatus,
} from '@g-motion/core';
import { WorldProvider } from '@g-motion/core';
import { AnimationControl } from './control';
import { validateMarkOptions } from './validation';
import { TrackBuilder } from './track';
import { applyAdjust } from './adjust';
import { runBatchAnimation, BatchTemplate } from './batch-runner';
export type { MarkOptions, ResolvedMarkOptions } from './mark';
import {
  MarkOptions,
  ResolvedMarkOptions,
  resolveMarkOptions,
  resolveTimeValue,
  computeMaxTime,
  getTargetType,
} from './mark';
import { addKeyframesForTarget } from './keyframes';
import { analyzeSpringTracks, analyzeInertiaTracks, buildInertiaComponent } from './physics';
import { buildRenderComponent } from './render';

/**
 * Creates a new animation builder for the given target.
 * @param target - The number, object, selector, or array of targets to animate.
 * @returns A MotionBuilder instance.
 */
export function motion(target: any, opts?: { world?: World }) {
  return new MotionBuilder(target, opts);
}

/**
 * Fluent API builder for defining animation sequences.
 * Supports both single and multi-entity animations.
 */
export class MotionBuilder {
  private tracks: TimelineData = new Map();
  private currentTime = 0;
  private targets: any[];
  private isBatch: boolean;
  // Precompiled batch templates: static marks resolved once
  private batchTemplates: BatchTemplate[] = [];

  constructor(target: any, opts?: { world?: World }) {
    // Normalize to array for unified handling
    if (Array.isArray(target)) {
      this.targets = target;
      this.isBatch = target.length > 1;
    } else {
      this.targets = [target];
      this.isBatch = false;
    }
    // Optional world injection for DI
    (this as any)._world = opts?.world;
  }

  /** For compatibility - get the primary target */
  private get target(): any {
    return this.targets[0];
  }

  track(prop: string): TrackBuilder {
    return new TrackBuilder(this, prop);
  }

  adjust(params: { offset?: number; scale?: number }): MotionBuilder {
    this.tracks = applyAdjust(this.tracks, params);
    this.currentTime = computeMaxTime(this.tracks);
    return this;
  }

  /**
   * Adds one or more keyframe markers to the animation timeline.
   * Accepts a single mark or an array of mark definitions.
   * Supports per-entity functions for batch animations.
   */
  mark(optionsBatch: MarkOptions | MarkOptions[]): this {
    const optsArray = Array.isArray(optionsBatch) ? optionsBatch : [optionsBatch];

    // Store precompiled templates for batch animation (don't process tracks yet)
    if (this.isBatch) {
      const staticResolved: ResolvedMarkOptions[] = [];
      const dynamic: MarkOptions[] = [];
      for (const opt of optsArray) {
        const isTimeStatic =
          typeof opt.at === 'number' || typeof opt.duration === 'number' || opt.at === undefined;
        const isToStatic = typeof opt.to !== 'function';
        if (isTimeStatic && isToStatic) {
          const resolved = resolveMarkOptions(opt, this.target, this.currentTime, 0, 0);
          staticResolved.push(resolved);
        } else {
          dynamic.push(opt);
        }
      }
      this.batchTemplates.push({ staticResolved, dynamic });
      // Update currentTime based on the last mark's time
      optsArray.forEach((opt) => {
        const timeVal = resolveTimeValue(opt, this.currentTime, 0, 0);
        this.currentTime = Math.max(this.currentTime, timeVal);
      });
      return this;
    }

    optsArray.forEach((opts) => this.processSingleMark(opts));
    return this;
  }

  /**
   * Starts the animation.
   * @param options - Playback options like delay, repeat count, or update callback.
   * @returns An AnimationControl to stop/pause the animation (supports batch operations).
   */
  animate(options?: {
    onUpdate?: (val: any) => void;
    delay?: number;
    repeat?: number;
    onComplete?: () => void;
  }): AnimationControl {
    if (this.isBatch) {
      return this.animateBatch(options);
    }

    const injectedWorld = (this as any)._world as World | undefined;
    const world = injectedWorld ?? WorldProvider.useWorld();
    this.registerCoreComponents(world);

    const targetType = getTargetType(this.target);
    const { hasSpring, springConfig, springVelocities } = analyzeSpringTracks(this.tracks);
    const { hasInertia, inertiaConfig, inertiaVelocities } = analyzeInertiaTracks(
      this.tracks,
      this.target,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const components: any = {
      MotionState: {
        delay: options?.delay ?? 0,
        startTime: performance.now() + (options?.delay ?? 0),
        pausedAt: 0,
        currentTime: 0,
        playbackRate: 1,
        status: MotionStatus.Running,
        iteration: 0,
      },
      Timeline: {
        tracks: this.tracks,
        duration: this.currentTime,
        loop: 0,
        repeat: options?.repeat ?? 0,
      },
    };

    // Add SpringComponent if spring physics is used
    if (hasSpring && springConfig) {
      components.Spring = {
        stiffness: springConfig.stiffness ?? 100,
        damping: springConfig.damping ?? 10,
        mass: springConfig.mass ?? 1,
        restSpeed: springConfig.restSpeed ?? 10,
        restDelta: springConfig.restDelta ?? 0.01,
        velocities: springVelocities,
      };
    }

    // Add InertiaComponent if inertia physics is used
    if (hasInertia && inertiaConfig) {
      components.Inertia = buildInertiaComponent(inertiaConfig, inertiaVelocities);
    }

    const renderData = buildRenderComponent(this.target, targetType, world, options?.onUpdate);
    if (renderData.Transform) {
      components.Transform = renderData.Transform;
    }
    if (renderData.Render) {
      components.Render = renderData.Render;
    }

    const entityId = world.createEntity(components);
    // Auto-start only when using default world; respect explicit world scopes
    if (!injectedWorld) {
      world.scheduler.start();
    }

    return new AnimationControl(entityId, undefined, false, world);
  }

  /**
   * Animate multiple entities with per-entity parameter resolution
   * @private
   */
  private animateBatch(options?: {
    onUpdate?: (val: any) => void;
    delay?: number;
    repeat?: number;
    onComplete?: () => void;
  }): AnimationControl {
    const injectedWorld = (this as any)._world as World | undefined;
    return runBatchAnimation({
      targets: this.targets,
      templates: this.batchTemplates,
      options,
      injectedWorld,
      createBuilder: (target) => new MotionBuilder(target, { world: injectedWorld }),
    });
  }

  // ============================================================================
  // Private: Batch Animation Helpers
  // ============================================================================

  /**
   * Serialize current builder state into the JSON schema shape used by contracts/json-schema.motion-timeline.json
   */
  toJSON() {
    const tracksArray = Array.from(this.tracks.entries()).map(([property, marks]) => ({
      property,
      marks: marks.map((kf) => ({
        time: kf.time,
        to: kf.endValue,
        duration: kf.time - kf.startTime,
        interp: kf.interp,
        bezier: kf.bezier,
        spring: kf.spring,
        inertia: kf.inertia,
        easing: kf.easing,
      })),
    }));

    return {
      motion: {
        id: undefined,
        tracks: tracksArray,
        timeline: {
          currentTime: 0,
          duration: this.currentTime,
          fps: 60,
        },
      },
    };
  }

  // ============================================================================
  // Private: Mark Processing Helpers
  // ============================================================================
  private processSingleMark(rawOptions: MarkOptions): void {
    const resolved = resolveMarkOptions(rawOptions, this.target, this.currentTime, 0, 0);
    validateMarkOptions(resolved);

    const targetType = getTargetType(this.target);
    const easing = resolved.ease;
    addKeyframesForTarget(this.tracks, this.target, targetType, resolved, easing);

    this.currentTime = resolved.time;
  }

  // Apply a pre-resolved mark without re-resolving per entity
  addResolvedMark(resolved: ResolvedMarkOptions): void {
    validateMarkOptions(resolved);
    const easing = resolved.ease;
    const targetType = getTargetType(this.target);
    addKeyframesForTarget(this.tracks, this.target, targetType, resolved, easing);
    this.currentTime = resolved.time;
  }
  // ============================================================================
  // Private: Animation Setup Helpers
  // ============================================================================

  private registerCoreComponents(world: World): void {
    if (!world.registry.get('MotionState')) {
      world.registry.register('MotionState', MotionStateComponent);
    }
    if (!world.registry.get('Timeline')) {
      world.registry.register('Timeline', TimelineComponent);
    }
    if (!world.registry.get('Render')) {
      world.registry.register('Render', RenderComponent);
    }
  }
}
