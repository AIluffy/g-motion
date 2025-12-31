import {
  SystemDef,
  SystemContext,
  MotionStatus,
  findActiveKeyframe,
  resolveEasing,
  extractTransformTypedBuffers,
  getGPUChannelMappingRegistry,
  type GPUComputeMode,
} from '@g-motion/core';
import { getProgress, resolveInterpMode } from '../api/timeline';
import { defaultRegistry } from '../values/registry';
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
    const config = (ctx?.services.config ?? world.config) as any;
    const metrics = ctx?.services.metrics;
    const gpuMode = (config?.gpuCompute ?? 'always') as GPUComputeMode;

    let gpuActive = false;
    if (gpuMode !== 'never' && metrics) {
      const status = metrics.getStatus();
      gpuActive = !!status.enabled && !!status.gpuInitialized && !status.cpuFallbackActive;
    }

    const gpuOnlyInterpolation = gpuActive && config?.gpuOnlyInterpolation === true;
    if (gpuOnlyInterpolation) {
      return;
    }

    const channelRegistry = gpuActive ? getGPUChannelMappingRegistry() : null;

    const engineFrame =
      typeof ctx?.sampling?.engineFrame === 'number' ? ctx!.sampling!.engineFrame : frameId++;
    const tickFrame =
      (config as any).samplingMode === 'frame' && typeof ctx?.sampling?.frame === 'number'
        ? ctx!.sampling!.frame
        : engineFrame;
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

      const typedTransformBuffers = extractTransformTypedBuffers(archetype);
      const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
      const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
      const typedDelay = archetype.getTypedBuffer('MotionState', 'delay');
      const typedTickInterval = archetype.getTypedBuffer('MotionState', 'tickInterval');
      const typedTickPhase = archetype.getTypedBuffer('MotionState', 'tickPhase');

      if (!stateBuffer || !timelineBuffer) continue;

      let gpuPropsForArchetype: Set<string> | null = null;
      if (channelRegistry) {
        const table = channelRegistry.getChannels(archetype.id);
        if (table && table.channels && table.channels.length > 0) {
          gpuPropsForArchetype = new Set<string>();
          for (const ch of table.channels) {
            gpuPropsForArchetype.add(ch.property);
          }
        }
      }

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
            if ((tickFrame + phase) % interval !== 0) {
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

        for (const [key, track] of timeline.tracks) {
          if (gpuPropsForArchetype && gpuPropsForArchetype.has(key)) {
            continue;
          }
          const activeKf = findActiveKeyframe(track as any, t) as any;

          if (activeKf) {
            let val: any;

            const mode = resolveInterpMode(activeKf);
            const { progress } = getProgress(t, activeKf);

            if (mode === 'hold') {
              if (activeKf.__valueInterp === 'registry') {
                const fromRaw = activeKf.__from ?? activeKf.startValue;
                const toRaw = activeKf.__to ?? activeKf.endValue;
                val = defaultRegistry.interpolate(fromRaw, toRaw, progress);
              } else {
                val = activeKf.endValue;
              }
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

              const numericVal =
                activeKf.startValue + (activeKf.endValue - activeKf.startValue) * eased;

              if (activeKf.__valueInterp === 'registry') {
                const fromRaw = activeKf.__from ?? activeKf.startValue;
                const toRaw = activeKf.__to ?? activeKf.endValue;
                val = defaultRegistry.interpolate(fromRaw, toRaw, eased);
              } else {
                val = numericVal;
              }
            }

            // Write Output
            let handled = false;

            if (transformBuffer) {
              // Check if key exists in TransformComponent schema (x, y, scaleX, scaleY, rotate)
              // In SoA/AoS hybrid, transformBuffer[i] is the object
              const transform = transformBuffer[i] as TransformComponentData;

              // P1-3 Optimization: Prioritize TypedArray writes to avoid redundant operations
              // Special handling for 'scale' - write to both scaleX and scaleY
              if (key === 'scale') {
                // Write to TypedArrays first (if available)
                let scaleChanged = false;
                if (typedTransformBuffers.scaleX) {
                  if (!Object.is(typedTransformBuffers.scaleX[i], val)) {
                    typedTransformBuffers.scaleX[i] = val;
                    scaleChanged = true;
                  }
                }
                if (typedTransformBuffers.scaleY) {
                  if (!Object.is(typedTransformBuffers.scaleY[i], val)) {
                    typedTransformBuffers.scaleY[i] = val;
                    scaleChanged = true;
                  }
                }
                if (typedTransformBuffers.scaleZ) {
                  if (!Object.is(typedTransformBuffers.scaleZ[i], val)) {
                    typedTransformBuffers.scaleZ[i] = val;
                    scaleChanged = true;
                  }
                }

                // Sync to object only if TypedArrays were updated
                if (scaleChanged) {
                  transform.scaleX = val;
                  transform.scaleY = val;
                  if ('scaleZ' in transform) {
                    (transform as any).scaleZ = val;
                  }
                  changed = true;
                } else {
                  // Fallback: no TypedArrays, write to object directly
                  if (!Object.is(transform.scaleX, val)) {
                    transform.scaleX = val;
                    changed = true;
                  }
                  if (!Object.is(transform.scaleY, val)) {
                    transform.scaleY = val;
                    changed = true;
                  }
                  if ('scaleZ' in transform && !Object.is((transform as any).scaleZ, val)) {
                    (transform as any).scaleZ = val;
                    changed = true;
                  }
                }
                handled = true;
              } else if (key in transform) {
                // P1-3: Prioritize TypedArray write
                const tbuf = typedTransformBuffers[key];
                if (tbuf) {
                  if (!Object.is(tbuf[i], val)) {
                    tbuf[i] = val;
                    // Sync to object (single write)
                    (transform as Record<string, number>)[key] = val;
                    changed = true;
                  }
                } else {
                  // Fallback: no TypedArray, write to object only
                  const obj = transform as Record<string, number>;
                  if (!Object.is(obj[key], val)) {
                    obj[key] = val;
                    changed = true;
                  }
                }
                handled = true;
              }
            }

            if (!handled && renderBuffer) {
              const r = renderBuffer[i] as RenderComponentData;
              r.props ||= {};

              // P1-3: Prioritize TypedArray write for common transform keys
              const tbuf = typedTransformBuffers[key];
              if (tbuf) {
                if (!Object.is(tbuf[i], val)) {
                  tbuf[i] = val;
                  // Sync to props (single write)
                  (r.props as any)[key] = val;
                  changed = true;
                }
              } else {
                // Fallback: no TypedArray, write to props only
                const prev = (r.props as any)[key];
                if (!Object.is(prev, val)) {
                  (r.props as any)[key] = val;
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
