import { MotionStatus, TimelineData, World, WorldProvider } from '@g-motion/core';
import { getNowMs } from '@g-motion/shared';
import type { ComponentValue } from '@g-motion/shared';
import { BatchTemplate, runBatchAnimation } from '../runtime/batch-runner';
import { applyAdjust } from './adjust';
import { AnimationControl, registerControlWithScope } from './control';
import type { DomAnimationScope } from './control';
import type { AnimationOptions } from './options';
import type { AnimatableProps, MotionTarget, MotionTargetValue } from '../types/targets';
import { addKeyframesForTarget } from './keyframes';
import type { Interpolator } from './interpolator';
import { KeyframeInterpolator } from './keyframe-interpolator';
import { TweenInterpolator } from './tween-interpolator';
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
import { ComponentRegistrar } from '../runtime/system-registry';
import {
  analyzeInertiaTracks,
  analyzeSpringTracks,
  assertPhysicsPluginInstalled,
  buildInertiaComponent,
} from '../runtime/physics-bridge';
import { AnimationValidator } from './validator';
import { GPUChannelMapper } from './gpu-channels';
import { buildRenderComponent } from './render';
import type { VisualTarget } from './visual-target';
import { getOrCreateVisualTarget } from './visual-target';

export interface PlayOptions<TValue = unknown> extends AnimationOptions<TValue> {}

type TrackMarkOptions = Pick<
  MarkOptions,
  'duration' | 'ease' | 'interp' | 'bezier' | 'spring' | 'inertia'
>;

export function motion<T extends MotionTarget>(
  target: T,
  opts?: { world?: World; scope?: DomAnimationScope },
): MotionBuilder<T> {
  return new MotionBuilder<T>(target, opts);
}

export class MotionBuilder<T extends MotionTarget> {
  private validator = new AnimationValidator();
  private componentRegistrar = new ComponentRegistrar();
  private gpuChannelMapper = new GPUChannelMapper();
  private tracks: TimelineData = new Map();
  private currentTime = 0;
  private targets: MotionTargetValue<T>[];
  private isBatch: boolean;
  private batchTemplates: BatchTemplate[] = [];
  private timelineVersion = 0;
  private playOptions: AnimationOptions<Partial<AnimatableProps<MotionTargetValue<T>>>> | undefined;
  private visualTarget?: VisualTarget;
  private cachedTargetType?: TargetType;
  private scope?: DomAnimationScope;
  private injectedWorld?: World;
  private interpolator: Interpolator;


  constructor(target: T, opts?: { world?: World; scope?: DomAnimationScope }) {
    if (Array.isArray(target)) {
      this.targets = target as MotionTargetValue<T>[];
      this.isBatch = target.length > 1;
    } else {
      this.targets = [target as MotionTargetValue<T>];
      this.isBatch = false;
    }
    this.injectedWorld = opts?.world;
    this.scope = opts?.scope;
    this.interpolator = new TweenInterpolator(0, 1);
  }

  private get target(): MotionTargetValue<T> {
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

  setInterpolator(interpolator: Interpolator): this {
    this.interpolator = interpolator;
    return this;
  }

  useTweenInterpolator(from: number, to: number, easing?: (t: number) => number): this {
    this.interpolator = new TweenInterpolator(from, to, easing);
    return this;
  }

  useKeyframeInterpolator(keyframes: number[], easing?: (t: number) => number): this {
    this.interpolator = new KeyframeInterpolator(keyframes, easing);
    return this;
  }

  evaluate(progress: number): number {
    return this.interpolator.evaluate(progress);
  }

  track(_prop: string): this {
    return this;
  }

  set(prop: string, timeOrDuration: number, to: number, options: TrackMarkOptions = {}): this {
    const payload: MarkOptions = {
      ...options,
      to: { [prop]: to },
    };

    if (options.duration !== undefined) {
      payload.duration = options.duration ?? timeOrDuration;
    } else {
      payload.at = timeOrDuration;
    }

    this.mark([payload as MarkOptions<MotionTargetValue<T>>]);
    return this;
  }

  adjust(params: { offset?: number; scale?: number }): MotionBuilder<T> {
    this.tracks = applyAdjust(this.tracks, params);
    this.currentTime = computeMaxTime(this.tracks);
    this.timelineVersion++;
    return this;
  }

  mark(
    optionsBatch: MarkOptions<MotionTargetValue<T>> | MarkOptions<MotionTargetValue<T>>[],
  ): this {
    const optsArray = Array.isArray(optionsBatch) ? optionsBatch : [optionsBatch];

    if (this.isBatch) {
      const normalizedOptions: MarkOptions[] = optsArray.map((opt) =>
        this.validator.validateMark(opt as MarkOptions),
      );
      const staticResolved: ResolvedMarkOptions[] = [];
      const dynamic: MarkOptions[] = [];
      for (const opt of normalizedOptions) {
        const isTimeStatic =
          typeof opt.at === 'number' || typeof opt.duration === 'number' || !opt.at;
        const isToStatic = typeof (opt as MarkOptions).to !== 'function';
        if (isTimeStatic && isToStatic) {
          const resolved = resolveMarkOptions<any>(opt, this.target, this.currentTime, 0, 0);
          staticResolved.push(resolved);
        } else {
          dynamic.push(opt);
        }
      }
      this.batchTemplates.push({ staticResolved, dynamic } as BatchTemplate);
      for (const opt of optsArray) {
        const timeVal = resolveTimeValue(opt, this.currentTime, 0, 0);
        this.currentTime = Math.max(this.currentTime, timeVal);
      }
      return this;
    }

    optsArray.forEach((opts) => this.processSingleMark(this.validator.validateMark(opts)));
    return this;
  }

  option(options: AnimationOptions<Partial<AnimatableProps<MotionTargetValue<T>>>>): this {
    this.playOptions = { ...(this.playOptions ?? {}), ...options };
    return this;
  }

  play(
    options?: AnimationOptions<Partial<AnimatableProps<MotionTargetValue<T>>>>,
  ): AnimationControl & PromiseLike<void> {
    if (this.isBatch) {
      return this.playBatch(options);
    }

    const resolvedOptions: AnimationOptions<Partial<AnimatableProps<MotionTargetValue<T>>>> = {
      ...(this.playOptions ?? {}),
      ...(options ?? {}),
    };

    const world = this.injectedWorld ?? WorldProvider.useWorld();
    this.componentRegistrar.ensureAnimationSystemsRegistered(world);
    this.componentRegistrar.registerCoreComponents(world);

    const visualTarget = this.getVisualTarget();
    const targetType = this.cachedTargetType ?? getTargetType(this.target);
    const { hasSpring, springConfig, springVelocities } = analyzeSpringTracks(this.tracks);
    const { hasInertia, inertiaConfig, inertiaVelocities } = analyzeInertiaTracks(
      this.tracks,
      this.target,
    );

    const components: Record<string, ComponentValue | undefined> = {
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

    if (hasSpring && springConfig) {
      assertPhysicsPluginInstalled('spring', 'spring');
      components.Spring = {
        stiffness: springConfig.stiffness ?? 100,
        damping: springConfig.damping ?? 10,
        mass: springConfig.mass ?? 1,
        restSpeed: springConfig.restSpeed ?? 10,
        restDelta: springConfig.restDelta ?? 0.01,
        velocities: springVelocities,
      };
    }

    if (hasInertia && inertiaConfig) {
      assertPhysicsPluginInstalled('inertia', 'inertia');
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
    if (!this.injectedWorld && typeof globalThis.requestAnimationFrame === 'function') {
      world.scheduler.start();
    }

    const control = new AnimationControl(entityId, undefined, false, world);
    AnimationControl.registerOnComplete(control, resolvedOptions.onComplete);
    if (this.scope) {
      registerControlWithScope(this.scope, control);
    }
    return control;
  }

  private playBatch(
    options?: AnimationOptions<Partial<AnimatableProps<MotionTargetValue<T>>>>,
  ): AnimationControl & PromiseLike<void> {
    const resolvedOptions: AnimationOptions<Partial<AnimatableProps<MotionTargetValue<T>>>> = {
      ...(this.playOptions ?? {}),
      ...(options ?? {}),
    };

    const batchParams: Parameters<typeof runBatchAnimation>[0] = {
      targets: this.targets as unknown[],
      templates: this.batchTemplates,
      options: resolvedOptions,
      injectedWorld: this.injectedWorld,
      createBuilder: (target) =>
        new MotionBuilder<any>(target, {
          world: this.injectedWorld,
          scope: this.scope,
        }),
    };

    return runBatchAnimation(batchParams) as AnimationControl & PromiseLike<void>;
  }

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

  private processSingleMark(rawOptions: MarkOptions<MotionTargetValue<T>>): void {
    const visualTarget = this.getVisualTarget();
    const resolved = resolveMarkOptions<any>(
      rawOptions as MarkOptions,
      this.target,
      this.currentTime,
      0,
      0,
    ) as ResolvedMarkOptions;

    const targetType = this.cachedTargetType ?? getTargetType(this.target);
    const easing = resolved.ease;
    addKeyframesForTarget(this.tracks, visualTarget, targetType, resolved, easing);
    this.currentTime = resolved.time;
    this.timelineVersion++;
  }

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
