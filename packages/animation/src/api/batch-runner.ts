import { AnimationControl } from './control';
import { MarkOptions, ResolvedMarkOptions } from './mark';

export type BatchTemplate = { staticResolved: ResolvedMarkOptions[]; dynamic: MarkOptions[] };

export interface BuilderAdapter {
  addResolvedMark(resolved: ResolvedMarkOptions): void;
  mark(options: MarkOptions | MarkOptions[]): BuilderAdapter;
  option(options: {
    onUpdate?: (val: any) => void;
    delay?: number;
    repeat?: number;
    onComplete?: () => void;
  }): BuilderAdapter;
  play(options?: {
    onUpdate?: (val: any) => void;
    delay?: number;
    repeat?: number;
    onComplete?: () => void;
  }): AnimationControl;
}

function resolveMarkForEntity(
  rawMark: MarkOptions,
  entityIndex: number,
  target: any,
): { resolved: MarkOptions; stagger: number } {
  const resolvedTo =
    typeof rawMark.to === 'function' ? rawMark.to(entityIndex, 0, target) : rawMark.to;

  const resolvedTime = typeof rawMark.at === 'function' ? rawMark.at(entityIndex, 0) : rawMark.at;

  let stagger = 0;
  if (rawMark.stagger !== undefined) {
    if (typeof rawMark.stagger === 'function') {
      stagger = rawMark.stagger(entityIndex);
    } else if (typeof rawMark.stagger === 'number') {
      stagger = entityIndex * rawMark.stagger;
    }
  }

  return {
    resolved: {
      to: resolvedTo,
      at: resolvedTime,
      duration: rawMark.duration,
      ease: rawMark.ease,
      interp: rawMark.interp,
      bezier: rawMark.bezier,
      spring: rawMark.spring,
      inertia: rawMark.inertia,
    },
    stagger,
  };
}

export function runBatchAnimation(params: {
  targets: any[];
  templates: BatchTemplate[];
  options?: {
    onUpdate?: (val: any) => void;
    delay?: number;
    repeat?: number;
    onComplete?: () => void;
  };
  createBuilder: (target: any) => BuilderAdapter;
  injectedWorld?: any;
}): AnimationControl {
  const controls: AnimationControl[] = [];
  const entityIds: number[] = [];

  params.targets.forEach((target, index) => {
    const builder = params.createBuilder(target);
    let totalStagger = 0;

    for (const tpl of params.templates) {
      for (const res of tpl.staticResolved) {
        builder.addResolvedMark(res);
      }
      if (tpl.dynamic.length) {
        const resolvedMarks: MarkOptions[] = [];
        for (const rawMark of tpl.dynamic) {
          const { resolved, stagger } = resolveMarkForEntity(rawMark, index, target);
          resolvedMarks.push(resolved);
          totalStagger = Math.max(totalStagger, stagger);
        }
        builder.mark(resolvedMarks);
      }
    }

    const control = builder
      .option({
        delay: (params.options?.delay ?? 0) + totalStagger,
        onUpdate: params.options?.onUpdate,
        repeat: params.options?.repeat,
      })
      .play();

    controls.push(control);
    const entityId = (control as any).entityId;
    if (entityId !== undefined) {
      if (Array.isArray(entityId)) {
        entityIds.push(...entityId);
      } else {
        entityIds.push(entityId);
      }
    }
  });

  const batchControl = new AnimationControl(entityIds, controls, true, params.injectedWorld);
  if (params.options?.onComplete) {
    AnimationControl.registerOnComplete(batchControl, params.options.onComplete);
  }
  return batchControl;
}
