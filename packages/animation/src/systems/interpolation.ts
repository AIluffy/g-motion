import {
  SystemDef,
  SystemContext,
  MotionStatus,
  findActiveKeyframe,
  resolveEasing,
  extractTransformTypedBuffers,
} from '@g-motion/core';
import { getProgress, resolveInterpMode } from '../api/timeline';
import type {
  MotionStateComponentData,
  TimelineComponentData,
  TransformComponentData,
  RenderComponentData,
} from '../component-types';

const archetypeScratch: any[] = [];
const pickedArchetypesScratch: any[] = [];
let archetypeCursor = 0;

let frameId = 0;

export const InterpolationSystem: SystemDef = {
  name: 'InterpolationSystem',
  order: 20,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;

    if (!world) {
      return;
    }
    const frame = frameId++;
    const config = (ctx?.services.config ?? world.config) as any;
    const slice = config?.workSlicing as
      | { enabled?: boolean; interpolationArchetypesPerFrame?: number }
      | undefined;
    const perFrame = slice?.enabled ? slice.interpolationArchetypesPerFrame : undefined;
    let toProcess: Iterable<any>;
    if (typeof perFrame === 'number' && Number.isFinite(perFrame)) {
      archetypeScratch.length = 0;
      for (const a of world.getArchetypes()) archetypeScratch.push(a);
      const len = archetypeScratch.length;
      if (len === 0) return;
      const limit = Math.max(1, Math.min(Math.floor(perFrame), len));
      const start = ((archetypeCursor % len) + len) % len;
      pickedArchetypesScratch.length = 0;
      const picked = pickedArchetypesScratch;
      for (let n = 0; n < limit; n++) {
        picked.push(archetypeScratch[(start + n) % len]);
      }
      archetypeCursor = (start + limit) % len;
      toProcess = picked;
    } else {
      toProcess = world.getArchetypes();
    }

    for (const archetype of toProcess) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const springBuffer = archetype.getBuffer('Spring');
      const inertiaBuffer = archetype.getBuffer('Inertia');

      const renderBuffer = archetype.getBuffer('Render');
      const transformBuffer = archetype.getBuffer('Transform');

      // Pre-fetch typed buffers for Transform numeric fields (SoA) to avoid repeated lookups
      // Note: typed buffers exist only when Transform schema declares numeric types
      const typedTransformBuffers = extractTransformTypedBuffers(archetype);
      const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
      const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
      const typedDelay = archetype.getTypedBuffer('MotionState', 'delay');
      const typedTickInterval = archetype.getTypedBuffer('MotionState', 'tickInterval');
      const typedTickPhase = archetype.getTypedBuffer('MotionState', 'tickPhase');

      if (!stateBuffer || !timelineBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        // Skip entities with SpringComponent or InertiaComponent; physics systems own them
        if ((springBuffer && springBuffer[i]) || (inertiaBuffer && inertiaBuffer[i])) {
          continue;
        }

        const state = stateBuffer[i] as MotionStateComponentData;
        const timeline = timelineBuffer[i] as TimelineComponentData & {
          tracks: Map<string, unknown>;
        };

        // Honor start delay: skip interpolation until delay fully consumed
        const delay = typedDelay ? typedDelay[i] : state.delay;
        if (delay && delay > 0) continue;

        const status = typedStatus ? (typedStatus[i] as unknown as MotionStatus) : state.status;
        if (status !== MotionStatus.Running && status !== MotionStatus.Finished) continue;

        if (status === MotionStatus.Running) {
          const interval = typedTickInterval
            ? typedTickInterval[i]
            : Number(state.tickInterval ?? 0);
          if (interval > 1) {
            const phase = typedTickPhase ? typedTickPhase[i] : Number(state.tickPhase ?? 0);
            if ((frame + phase) % interval !== 0) {
              continue;
            }
          }
        }

        const render = renderBuffer ? (renderBuffer[i] as RenderComponentData) : undefined;
        let changed = false;
        if (render && !render.props) {
          render.props = {};
          changed = true;
        }

        const t = typedCurrentTime ? typedCurrentTime[i] : state.currentTime;

        // timeline.tracks is a Map<string, Track>
        for (const [key, track] of timeline.tracks) {
          // Use binary search to find active keyframe (O(log n) instead of O(n))
          const activeKf = findActiveKeyframe(track as any, t);

          if (activeKf) {
            let val: number;

            const mode = resolveInterpMode(activeKf);
            const { progress } = getProgress(t, activeKf);

            if (mode === 'hold') {
              val = activeKf.endValue;
            } else {
              let eased = progress;

              if (mode === 'bezier' && activeKf.bezier) {
                eased = cubicBezier(
                  activeKf.bezier.cx1,
                  activeKf.bezier.cy1,
                  activeKf.bezier.cx2,
                  activeKf.bezier.cy2,
                  progress,
                );
              } else if (mode === 'autoBezier') {
                const { cx1, cy1, cx2, cy2 } = AUTO_BEZIER_DEFAULT;
                eased = cubicBezier(cx1, cy1, cx2, cy2, progress);
              } else if (activeKf.easing) {
                const easingFn = resolveEasing(activeKf.easing);
                eased = easingFn(progress);
              }

              // For spring/inertia we currently fall back to linear interpolation in this system;
              // dedicated physics systems handle those components when present.
              val = activeKf.startValue + (activeKf.endValue - activeKf.startValue) * eased;
            }

            // Write Output
            let handled = false;

            if (transformBuffer) {
              // Check if key exists in TransformComponent schema (x, y, scaleX, scaleY, rotate)
              // In SoA/AoS hybrid, transformBuffer[i] is the object
              const transform = transformBuffer[i] as TransformComponentData;

              // Special handling for 'scale' - write to both scaleX and scaleY
              if (key === 'scale') {
                if (!Object.is(transform.scaleX, val)) {
                  transform.scaleX = val;
                  changed = true;
                }
                if (!Object.is(transform.scaleY, val)) {
                  transform.scaleY = val;
                  changed = true;
                }
                if ('scaleZ' in transform) {
                  if (!Object.is((transform as any).scaleZ, val)) {
                    (transform as any).scaleZ = val;
                    changed = true;
                  }
                }
                // Also write to typed buffers when available
                if (
                  typedTransformBuffers.scaleX &&
                  !Object.is(typedTransformBuffers.scaleX[i], val)
                ) {
                  typedTransformBuffers.scaleX[i] = val;
                  changed = true;
                }
                if (
                  typedTransformBuffers.scaleY &&
                  !Object.is(typedTransformBuffers.scaleY[i], val)
                ) {
                  typedTransformBuffers.scaleY[i] = val;
                  changed = true;
                }
                if (
                  typedTransformBuffers.scaleZ &&
                  !Object.is(typedTransformBuffers.scaleZ[i], val)
                ) {
                  typedTransformBuffers.scaleZ[i] = val;
                  changed = true;
                }
                handled = true;
              } else if (key in transform) {
                const obj = transform as Record<string, number>;
                if (!Object.is(obj[key], val)) {
                  obj[key] = val;
                  changed = true;
                }
                // Also write to typed buffer for this key when available
                const tbuf = typedTransformBuffers[key];
                if (tbuf) {
                  if (!Object.is(tbuf[i], val)) {
                    tbuf[i] = val;
                    changed = true;
                  }
                }
                handled = true;
              }
            }

            if (!handled && renderBuffer) {
              const r = renderBuffer[i] as RenderComponentData;
              r.props ||= {};
              const prev = (r.props as any)[key];
              if (!Object.is(prev, val)) {
                (r.props as any)[key] = val;
                changed = true;
              }
              // No Transform component present: attempt to map common keys to typed buffers
              const tbuf = typedTransformBuffers[key];
              if (tbuf) {
                if (!Object.is(tbuf[i], val)) {
                  tbuf[i] = val;
                  changed = true;
                }
              }
            }
          }
        }

        if (changed && render) {
          render.version = (render.version ?? 0) + 1;
        }
      }
    }
  },
};

// Simple cubic-bezier evaluator based on control points in unit square
function cubicBezier(_cx1: number, cy1: number, _cx2: number, cy2: number, t: number): number {
  // Clamp t to [0,1]
  const clampedT = Math.min(1, Math.max(0, t));

  // Cubic Bezier polynomial expansion for y given x is approximated by parameter t.
  const u = 1 - clampedT;
  const tt = clampedT * clampedT;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * clampedT;

  // Bezier formula on y-axis
  const p0 = 0;
  const p1 = cy1;
  const p2 = cy2;
  const p3 = 1;

  return uuu * p0 + 3 * uu * clampedT * p1 + 3 * u * tt * p2 + ttt * p3;
}

const AUTO_BEZIER_DEFAULT = {
  cx1: 0.25,
  cy1: 0.1,
  cx2: 0.25,
  cy2: 1,
};
