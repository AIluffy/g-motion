import { getEngineForWorld, MotionStatus, World, WorldProvider } from '@g-motion/core';
import { getDomEnvironment } from '@g-motion/shared';
import { motion as builderMotion } from './api/builder';
import type { DomAnimationScope } from './api/control';
import { AnimationControl } from './api/control';
import {
  resolveTargets,
  type SelectorCache,
  type TargetScopeRoot,
  type TargetType,
} from './api/mark';
import { isVisualTargetCached } from './api/visual-target';
import { registerAnimationSystems } from './registery';
import type { MotionTarget } from './types';

const initializedWorlds = new WeakSet<World>();

type MotionStatusListenerWorld = World & {
  addMotionStatusListener: (listener: (event: {
    entityId: number;
    prevStatus?: number;
    nextStatus: number;
  }) => void) => void;
};

function supportsMotionStatusListener(world: World): world is MotionStatusListenerWorld {
  return typeof (world as Partial<MotionStatusListenerWorld>).addMotionStatusListener === 'function';
}

function initEngine(world: World) {
  if (initializedWorlds.has(world)) return;
  initializedWorlds.add(world);

  getEngineForWorld(world);

  if (supportsMotionStatusListener(world)) {
    world.addMotionStatusListener(
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
          world,
          entityId,
          prevStatus as MotionStatus | undefined,
          nextStatus as MotionStatus,
        );
      },
    );
  }

  registerAnimationSystems(world);
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
  const domEnv = getDomEnvironment();
  const hasDOM = domEnv.hasDocument();
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

export const motion = <T extends MotionTarget = any>(target: T, options?: MotionOptions) => {
  const world = WorldProvider.useWorld();
  initEngine(world);
  const root = typeof document !== 'undefined' ? document : null;
  const builderTarget = normalizeTargets(target, root, options);
  return builderMotion<T>(builderTarget as T);
};

type ScopedMotionFn = ((target: any) => ReturnType<typeof builderMotion>) & {
  scope: DomAnimationScope;
};

export function createScopedMotion(root: Element): ScopedMotionFn {
  const world = WorldProvider.useWorld();
  initEngine(world);
  const scope: DomAnimationScope = {
    root,
    animations: [],
  };

  const scopedMotion = ((target: any) => {
    const builderTarget = normalizeTargets(target, scope.root);
    return builderMotion(builderTarget, { world, scope });
  }) as ScopedMotionFn;

  scopedMotion.scope = scope;
  return scopedMotion;
}

export { FrameSampler } from '@g-motion/shared';
export type { FrameRoundingMode } from '@g-motion/shared';
export * from './api/adjust';
export * from './api/animate';
export * from './api/animation-options';
export * from './api/builder';
export * from './api/control';
export * from './api/gpu-status';
export * from './api/mark';
export * from './api/visual-target';
export * from './api/timeline-api';
export * from './types';
export { engine } from './engine';
