import {
  World,
  WorldProvider,
  TimeSystem,
  RenderSystem,
  BatchSamplingSystem,
  WebGPUComputeSystem,
  GPUResultApplySystem,
  ActiveEntityMonitorSystem,
  getEngineForWorld,
  MotionStatus,
} from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';
import { TimelineSystem } from './systems/timeline';
import { InterpolationSystem } from './systems/interpolation';
import { RovingResolverSystem } from './systems/rovingResolver';
import { motion as builderMotion } from './api/builder';
import {
  resolveTargets,
  type SelectorCache,
  type TargetScopeRoot,
  type TargetType,
} from './api/mark';
import type { DomAnimationScope } from './api/control';
import { registerControlWithScope, AnimationControl } from './api/control';
import { isVisualTargetCached } from './api/visualTarget';

let initialized = false;
const debug = createDebugger('Animation');

function initEngine() {
  if (initialized) return;
  initialized = true;

  const world = WorldProvider.useWorld();
  getEngineForWorld(world);

  if (typeof (world as any).addMotionStatusListener === 'function') {
    if (!(world as any).__motionStatusHookInstalled) {
      (world as any).addMotionStatusListener(
        ({
          entityId,
          prevStatus,
          nextStatus,
        }: {
          entityId: number;
          prevStatus?: number;
          nextStatus: number;
        }) => {
          AnimationControl.handleMotionStatusChange(
            entityId,
            prevStatus as MotionStatus | undefined,
            nextStatus as MotionStatus,
          );
        },
      );
      (world as any).__motionStatusHookInstalled = true;
    }
  }

  debug('Initializing engine, registering systems');
  registerAnimationSystems(world);
}

/**
 * Register animation systems into a specific World instance.
 * This enables per-world system registration for multi-world isolation.
 *
 * Note: All animations now default to GPU compute path with CPU fallback.
 * ThresholdMonitorSystem has been removed - GPU is always attempted first.
 */
export function registerAnimationSystems(world: World) {
  debug('Registering animation systems for world');
  world.scheduler.add(TimeSystem);
  world.scheduler.add(TimelineSystem);
  world.scheduler.add(RovingResolverSystem);
  world.scheduler.add(InterpolationSystem);
  world.scheduler.add(BatchSamplingSystem);
  world.scheduler.add(WebGPUComputeSystem);
  world.scheduler.add(GPUResultApplySystem);
  world.scheduler.add(ActiveEntityMonitorSystem);
  world.scheduler.add(RenderSystem);
}

type MotionOptions = {
  strictTargets?: boolean;
};

export type TargetInspection = {
  target: unknown;
  type: TargetType;
  isVisualTargetCached: boolean;
};

export type InspectTargetsOptions = {
  root?: TargetScopeRoot;
  strictTargets?: boolean;
};

export type InspectTargetsResult = {
  input: unknown;
  root: TargetScopeRoot;
  targets: TargetInspection[];
  env: {
    hasDocument: boolean;
    hasWindow: boolean;
    hasDOM: boolean;
  };
};

function normalizeTargets(
  target: any,
  root: Document | Element | null | undefined,
  options?: MotionOptions,
): any {
  const selectorCache: SelectorCache = {};
  const resolved = resolveTargets(target, {
    root: root ?? undefined,
    selectorCache,
    strictTargets: options?.strictTargets,
  });
  if (resolved.length === 1) {
    return resolved[0].target;
  }
  if (resolved.length > 1) {
    return resolved.map((t) => t.target);
  }
  return target;
}

export function inspectTargets(
  input: unknown,
  options?: InspectTargetsOptions,
): InspectTargetsResult {
  const root = options?.root ?? (typeof document !== 'undefined' ? document : null);
  const hasDocument = typeof document !== 'undefined';
  const hasWindow = typeof window !== 'undefined';
  const hasDOM = hasDocument && typeof (document as any).querySelectorAll === 'function';
  const selectorCache: SelectorCache = {};
  const resolved = resolveTargets(input, {
    root: root ?? undefined,
    selectorCache,
    strictTargets: options?.strictTargets,
  });
  const targets: TargetInspection[] = resolved.map((t) => ({
    target: t.target,
    type: t.type,
    isVisualTargetCached: isVisualTargetCached(t.target, t.type),
  }));
  return {
    input,
    root,
    targets,
    env: {
      hasDocument,
      hasWindow,
      hasDOM,
    },
  };
}

export const motion = (target: any, options?: MotionOptions) => {
  initEngine();
  const root = typeof document !== 'undefined' ? document : null;
  const builderTarget = normalizeTargets(target, root, options);
  return builderMotion(builderTarget);
};

type ScopedMotionFn = ((target: any) => ReturnType<typeof builderMotion>) & {
  scope: DomAnimationScope;
};

export function createScopedMotion(root: Element): ScopedMotionFn {
  initEngine();
  const scope: DomAnimationScope = {
    root,
    animations: [],
  };

  const scopedMotion = ((target: any) => {
    const builderTarget = normalizeTargets(target, scope.root);
    const builder = builderMotion(builderTarget);
    const originalPlay = builder.play.bind(builder) as (options?: any) => any;
    (builder as any).play = (options?: any) => {
      const control = originalPlay(options);
      registerControlWithScope(scope, control);
      return control;
    };
    return builder;
  }) as ScopedMotionFn;

  scopedMotion.scope = scope;
  return scopedMotion;
}

export * from './api/control';
export * from './api/builder';
export * from './api/gpu-status';
export * from './api/track';
export * from './api/adjust';
export * from './api/mark';
export * from './api/animate';
export * from './values';
export { engine } from './engine';
export * from './api/visualTarget';
