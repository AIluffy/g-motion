import { MotionStatus, TimelineData, World, WorldProvider } from '@g-motion/core';
import { getNowMs } from '@g-motion/shared';
import { BatchTemplate, runBatchAnimation } from '../batch-runner';
import { applyAdjust } from './adjust';
import { AnimationControl, registerControlWithScope } from './control';
import type { DomAnimationScope } from './control';
import type { AnimationOptions } from './animation-options';
import { addKeyframesForTarget } from './keyframes';
import {
  computeMaxTime,
  getTargetType,
  MarkOptions,
  ResolvedMarkOptions,
  resolveMarkOptions,
  resolveTimeValue,
  TargetType,
} from './mark';
export type { MarkOptions, ResolvedMarkOptions } from './mark';
// Import physics analyzers from plugins
import { analyzeInertiaTracks, buildInertiaComponent } from '@g-motion/plugin-inertia';
import { analyzeSpringTracks } from '@g-motion/plugin-spring';
import { ComponentRegistrar } from '../registery';
import { AnimationValidator } from './animation-validator';
import { GPUChannelMapper } from './gpu-channel-mapper';
import { buildRenderComponent } from './render';
import type { VisualTarget } from './visual-target';
import { getOrCreateVisualTarget } from './visual-target';

export interface PlayOptions extends AnimationOptions {}


type TrackMarkOptions = Pick<
  MarkOptions,
  'duration' | 'ease' | 'interp' | 'bezier' | 'spring' | 'inertia'
>;

/**
 * Creates a new animation builder for the given target.
 * @param target - The number, object, selector, or array of targets to animate.
 * @returns A MotionBuilder instance.
 */
export function motion(target: any, opts?: { world?: World; scope?: DomAnimationScope }) {
  return new MotionBuilder(target, opts);
}

/**
 * Fluent API builder for defining animation sequences.
 * Supports both single and multi-entity animations.
 */
export class MotionBuilder {
  private validator = new AnimationValidator();
  private componentRegistrar = new ComponentRegistrar();
  private gpuChannelMapper = new GPUChannelMapper();
  private tracks: TimelineData = new Map();
  private currentTime = 0;
  private targets: any[];
  private isBatch: boolean;
  // Precompiled batch templates: static marks resolved once
  private batchTemplates: BatchTemplate[] = [];
  private timelineVersion = 0;
  private playOptions: AnimationOptions | undefined;
  private visualTarget?: VisualTarget;
  private cachedTargetType?: TargetType;
  private scope?: DomAnimationScope;

  constructor(target: any, opts?: { world?: World; scope?: DomAnimationScope }) {
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
    this.scope = opts?.scope;
  }

  /** For compatibility - get the primary target */
  private get target(): any {
    return this.targets[0];
  }

  private getVisualTarget(): VisualTarget {
    if (this.visualTarget) return this.visualTarget;
    const type = getTargetType(this.target);
    this.cachedTargetType = type;
    const vt = getOrCreateVisualTarget(this.target, type);
    this.visualTarget = vt;
    return vt;
  }

  track(prop: string): this {
    // For chaining: builder.track('x').mark({...})
    // The property is stored for the next mark() call
    (this as any)._pendingTrackProperty = prop;
    return this;
  }

  /**
   * Shorthand to set a property value at a specific time or duration.
   * @param prop - The property to set
   * @param timeOrDuration - Time in ms (if options.duration set) or absolute time
   * @param to - The target value
   * @param options - Optional mark settings (duration, easing, etc.)
   */
  set(prop: string, timeOrDuration: number, to: number, options: TrackMarkOptions = {}): this {
    const payload: MarkOptions & { to: Record<string, number> } = {
      ...options,
      to: { [prop]: to },
    };

    if (options.duration !== undefined) {
      payload.duration = options.duration ?? timeOrDuration;
    } else {
      payload.at = timeOrDuration;
    }

    this.mark([payload as MarkOptions]);
    return this;
  }

  adjust(params: { offset?: number; scale?: number }): MotionBuilder {
    this.tracks = applyAdjust(this.tracks, params);
    this.currentTime = computeMaxTime(this.tracks);
    this.timelineVersion++;
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
      const normalizedOptions = optsArray.map((opt) => this.validator.validateMark(opt));
      const staticResolved: ResolvedMarkOptions[] = [];
      const dynamic: MarkOptions[] = [];
      for (const opt of normalizedOptions) {
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

    optsArray.forEach((opts) => this.processSingleMark(this.validator.validateMark(opts)));
    return this;
  }

  option(options: AnimationOptions): this {
    this.playOptions = { ...(this.playOptions ?? {}), ...options };
    return this;
  }

  play(options?: AnimationOptions): AnimationControl {
    if (this.isBatch) {
      return this.playBatch(options);
    }

    const resolvedOptions: AnimationOptions = {
      ...(this.playOptions ?? {}),
      ...(options ?? {}),
    };

    const injectedWorld = (this as any)._world as World | undefined;
    const world = injectedWorld ?? WorldProvider.useWorld();
    this.componentRegistrar.ensureAnimationSystemsRegistered(world);
    this.componentRegistrar.registerCoreComponents(world);

    const visualTarget = this.getVisualTarget();
    const targetType = this.cachedTargetType ?? getTargetType(this.target);
    const { hasSpring, springConfig, springVelocities } = analyzeSpringTracks(this.tracks);
    const { hasInertia, inertiaConfig, inertiaVelocities } = analyzeInertiaTracks(
      this.tracks,
      this.target,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const components: any = {
      MotionState: {
        delay: resolvedOptions.delay ?? 0,
        startTime: getNowMs(),
        pausedAt: 0,
        currentTime: 0,
        playbackRate: 1,
        status: MotionStatus.Running,
        iteration: 0,
      },
      Timeline: {
        tracks: this.tracks,
        duration: this.currentTime,
        loop: Infinity,
        repeat: resolvedOptions.repeat ?? 0,
        version: this.timelineVersion,
        rovingApplied: 0,
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

    const renderData = buildRenderComponent(
      this.target,
      targetType,
      world,
      resolvedOptions.onUpdate,
    );
    if (renderData.Transform) {
      components.Transform = renderData.Transform;
    }
    if (renderData.Render) {
      components.Render = renderData.Render;
    }

    if (this.tracks.size > 0) {
      const componentNames = Object.keys(components).sort();
      const render = components.Render as { rendererId?: string } | undefined;
      const archetypeId =
        render && typeof render.rendererId === 'string'
          ? `${componentNames.join('|')}::${render.rendererId}`
          : componentNames.join('|');
      this.gpuChannelMapper.registerChannels({
        archetypeId,
        targetType,
        tracks: this.tracks,
        visualTarget,
      });
    }

    const entityId = world.createEntity(components);
    if (!injectedWorld && typeof (globalThis as any).requestAnimationFrame === 'function') {
      world.scheduler.start();
    }

    const control = new AnimationControl(entityId, undefined, false, world);
    AnimationControl.registerOnComplete(control, resolvedOptions.onComplete);
    if (this.scope) {
      registerControlWithScope(this.scope, control);
    }
    return control;
  }

  private playBatch(options?: AnimationOptions): AnimationControl {
    const resolvedOptions: AnimationOptions = {
      ...(this.playOptions ?? {}),
      ...(options ?? {}),
    };
    const injectedWorld = (this as any)._world as World | undefined;
    return runBatchAnimation({
      targets: this.targets,
      templates: this.batchTemplates,
      options: resolvedOptions,
      injectedWorld,
      createBuilder: (target) =>
        new MotionBuilder(target, { world: injectedWorld, scope: this.scope }),
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
    const visualTarget = this.getVisualTarget();
    const resolved = resolveMarkOptions(rawOptions, this.target, this.currentTime, 0, 0);

    const targetType = this.cachedTargetType ?? getTargetType(this.target);
    const easing = resolved.ease;
    addKeyframesForTarget(this.tracks, visualTarget, targetType, resolved, easing);
    this.currentTime = resolved.time;
    this.timelineVersion++;
  }

  // Apply a pre-resolved mark without re-resolving per entity
  addResolvedMark(resolved: ResolvedMarkOptions): void {
    this.validator.validateResolvedMark(resolved);
    const easing = resolved.ease;
    const visualTarget = this.getVisualTarget();
    const targetType = this.cachedTargetType ?? getTargetType(this.target);
    addKeyframesForTarget(this.tracks, visualTarget, targetType, resolved, easing);
    this.currentTime = resolved.time;
    this.timelineVersion++;
  }
}
