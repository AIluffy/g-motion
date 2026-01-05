import {
  World,
  MotionStateComponent,
  TimelineComponent,
  TimelineData,
  RenderComponent,
  MotionStatus,
  getGPUChannelMappingRegistry,
  createBatchChannelTable,
  OUTPUT_FORMAT,
} from '@g-motion/core';
import { WorldProvider } from '@g-motion/core';
import { registerAnimationSystems } from '../index';
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
  TargetType,
} from './mark';
import { addKeyframesForTarget } from './keyframes';
import { analyzeSpringTracks, analyzeInertiaTracks, buildInertiaComponent } from './physics';
import { buildRenderComponent } from './render';
import type { VisualTarget } from './visualTarget';
import { getOrCreateVisualTarget } from './visualTarget';

type PlayOptions = {
  onUpdate?: (val: any) => void;
  delay?: number;
  repeat?: number;
  onComplete?: () => void;
};

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
  private timelineVersion = 0;
  private playOptions: PlayOptions | undefined;
  private visualTarget?: VisualTarget;
  private cachedTargetType?: TargetType;

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

  private getVisualTarget(): VisualTarget {
    if (this.visualTarget) return this.visualTarget;
    const type = getTargetType(this.target);
    this.cachedTargetType = type;
    const vt = getOrCreateVisualTarget(this.target, type);
    this.visualTarget = vt;
    return vt;
  }

  track(prop: string): TrackBuilder {
    return new TrackBuilder(this, prop);
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
      for (const opt of optsArray) {
        validateMarkOptions({
          ...(opt as any),
          time: (opt as any).time ?? opt.at,
        });
      }
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

  option(options: PlayOptions): this {
    this.playOptions = { ...(this.playOptions ?? {}), ...options };
    return this;
  }

  play(options?: PlayOptions): AnimationControl {
    if (this.isBatch) {
      return this.playBatch(options);
    }

    const resolvedOptions: PlayOptions = {
      ...(this.playOptions ?? {}),
      ...(options ?? {}),
    };

    const injectedWorld = (this as any)._world as World | undefined;
    const world = injectedWorld ?? WorldProvider.useWorld();
    // Ensure animation systems are registered for this world (idempotent guard)
    if (!(world as any).__animationSystemsRegistered) {
      registerAnimationSystems(world);
      (world as any).__animationSystemsRegistered = true;
    }
    this.registerCoreComponents(world);

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
        startTime: performance.now() + (resolvedOptions.delay ?? 0),
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
      const registry = getGPUChannelMappingRegistry();

      if (targetType === TargetType.Primitive) {
        if (this.tracks.has('__primitive') && visualTarget.canUseGPU('__primitive')) {
          registry.registerBatchChannels({
            batchId: archetypeId,
            rawStride: 1,
            rawChannels: [{ index: 0, property: '__primitive' }],
            stride: 1,
            channels: [{ index: 0, property: '__primitive', formatType: OUTPUT_FORMAT.FLOAT }],
          });
        }
      }

      if (targetType === TargetType.DOM || targetType === TargetType.Object) {
        const properties: string[] = [];
        for (const key of this.tracks.keys()) {
          if (key === '__primitive') continue;
          properties.push(key);
        }
        if (properties.length) {
          const gpuProps = properties.filter((prop) => visualTarget.canUseGPU(prop));
          if (gpuProps.length) {
            const standardTransformProps = ['x', 'y', 'rotate', 'scaleX', 'scaleY', 'opacity'];
            const canUsePackedTransform =
              gpuProps.length === standardTransformProps.length &&
              standardTransformProps.every((p) => gpuProps.includes(p));

            if (canUsePackedTransform) {
              const rawChannels = standardTransformProps.map((prop, idx) => ({
                index: idx,
                property: prop,
              }));
              const channels = [
                {
                  index: 0,
                  property: '__packed0',
                  sourceIndex: 0,
                  formatType: OUTPUT_FORMAT.PACKED_HALF2,
                  packedProps: ['x', 'y'] as [string, string],
                },
                {
                  index: 1,
                  property: '__packed1',
                  sourceIndex: 2,
                  formatType: OUTPUT_FORMAT.PACKED_HALF2,
                  packedProps: ['rotate', 'scaleX'] as [string, string],
                },
                {
                  index: 2,
                  property: '__packed2',
                  sourceIndex: 4,
                  formatType: OUTPUT_FORMAT.PACKED_HALF2,
                  packedProps: ['scaleY', 'opacity'] as [string, string],
                },
              ];
              registry.registerBatchChannels({
                batchId: archetypeId,
                rawStride: rawChannels.length,
                rawChannels,
                stride: channels.length,
                channels,
              });
            } else {
              const table = createBatchChannelTable(archetypeId, gpuProps.length, gpuProps);
              for (const ch of table.channels) {
                switch (ch.property) {
                  case 'rotate':
                  case 'rotateX':
                  case 'rotateY':
                  case 'rotateZ':
                    ch.formatType = OUTPUT_FORMAT.ANGLE_DEG;
                    break;
                  case 'opacity':
                    ch.formatType = OUTPUT_FORMAT.COLOR_NORM;
                    ch.minValue = 0;
                    ch.maxValue = 1;
                    break;
                  default:
                    ch.formatType = OUTPUT_FORMAT.FLOAT;
                    break;
                }
              }
              registry.registerBatchChannels(table);
            }
          }
        }
      }
    }

    const entityId = world.createEntity(components);
    if (!injectedWorld && typeof (globalThis as any).requestAnimationFrame === 'function') {
      world.scheduler.start();
    }

    const control = new AnimationControl(entityId, undefined, false, world);
    AnimationControl.registerOnComplete(control, resolvedOptions.onComplete);
    return control;
  }

  private playBatch(options?: PlayOptions): AnimationControl {
    const resolvedOptions: PlayOptions = {
      ...(this.playOptions ?? {}),
      ...(options ?? {}),
    };
    const injectedWorld = (this as any)._world as World | undefined;
    return runBatchAnimation({
      targets: this.targets,
      templates: this.batchTemplates,
      options: resolvedOptions,
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
    validateMarkOptions({
      ...(rawOptions as any),
      time: (rawOptions as any).time ?? rawOptions.at,
    });
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
    validateMarkOptions(resolved);
    const easing = resolved.ease;
    const visualTarget = this.getVisualTarget();
    const targetType = this.cachedTargetType ?? getTargetType(this.target);
    addKeyframesForTarget(this.tracks, visualTarget, targetType, resolved, easing);
    this.currentTime = resolved.time;
    this.timelineVersion++;
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
