import { SystemDef, World, MotionStatus, findActiveKeyframe, resolveEasing } from '@g-motion/core';
import { getProgress, resolveInterpMode } from '../api/timeline';

export const InterpolationSystem: SystemDef = {
  name: 'InterpolationSystem',
  order: 20,
  update() {
    const world = World.get();
    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const springBuffer = archetype.getBuffer('Spring');
      const inertiaBuffer = archetype.getBuffer('Inertia');

      const renderBuffer = archetype.getBuffer('Render');
      const transformBuffer = archetype.getBuffer('Transform');

      // Pre-fetch typed buffers for Transform numeric fields (SoA) to avoid repeated lookups
      // Note: typed buffers exist only when Transform schema declares numeric types
      const typedTransformBuffers: Record<
        string,
        Float32Array | Float64Array | Int32Array | undefined
      > = {
        x: archetype.getTypedBuffer('Transform', 'x'),
        y: archetype.getTypedBuffer('Transform', 'y'),
        translateX: archetype.getTypedBuffer('Transform', 'translateX'),
        translateY: archetype.getTypedBuffer('Transform', 'translateY'),
        translateZ: archetype.getTypedBuffer('Transform', 'translateZ'),
        z: archetype.getTypedBuffer('Transform', 'z'),
        rotate: archetype.getTypedBuffer('Transform', 'rotate'),
        rotateX: archetype.getTypedBuffer('Transform', 'rotateX'),
        rotateY: archetype.getTypedBuffer('Transform', 'rotateY'),
        rotateZ: archetype.getTypedBuffer('Transform', 'rotateZ'),
        scale: archetype.getTypedBuffer('Transform', 'scale'),
        scaleX: archetype.getTypedBuffer('Transform', 'scaleX'),
        scaleY: archetype.getTypedBuffer('Transform', 'scaleY'),
        scaleZ: archetype.getTypedBuffer('Transform', 'scaleZ'),
        perspective: archetype.getTypedBuffer('Transform', 'perspective'),
      };

      if (!stateBuffer || !timelineBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        // Skip entities with SpringComponent or InertiaComponent; physics systems own them
        if ((springBuffer && springBuffer[i]) || (inertiaBuffer && inertiaBuffer[i])) {
          continue;
        }

        const state = stateBuffer[i];
        const timeline = timelineBuffer[i];

        // Honor start delay: skip interpolation until delay fully consumed
        if ((state as any).delay && (state as any).delay > 0) continue;

        if (state.status !== MotionStatus.Running && state.status !== MotionStatus.Finished)
          continue;

        // Pre-allocate render.props if needed (avoid allocation in hot loop)
        if (renderBuffer && !renderBuffer[i]) {
          renderBuffer[i] = { props: {} };
        }
        if (renderBuffer && renderBuffer[i] && !renderBuffer[i].props) {
          renderBuffer[i].props = {};
        }

        const t = state.currentTime;

        // timeline.tracks is a Map<string, Track>
        for (const [key, track] of timeline.tracks) {
          // Use binary search to find active keyframe (O(log n) instead of O(n))
          const activeKf = findActiveKeyframe(track, t);

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
              const transform = transformBuffer[i];

              // Special handling for 'scale' - write to both scaleX and scaleY
              if (key === 'scale') {
                transform.scaleX = val;
                transform.scaleY = val;
                if ('scaleZ' in transform) {
                  transform.scaleZ = val;
                }
                // Also write to typed buffers when available
                if (typedTransformBuffers.scaleX) typedTransformBuffers.scaleX[i] = val;
                if (typedTransformBuffers.scaleY) typedTransformBuffers.scaleY[i] = val;
                if (typedTransformBuffers.scaleZ) typedTransformBuffers.scaleZ[i] = val;
                handled = true;
              } else if (key in transform) {
                transform[key] = val;
                // Also write to typed buffer for this key when available
                const tbuf = typedTransformBuffers[key];
                if (tbuf) {
                  tbuf[i] = val;
                }
                handled = true;
              }
            }

            if (!handled && renderBuffer) {
              const render = renderBuffer[i];
              render.props[key] = val;
              // No Transform component present: attempt to map common keys to typed buffers
              const tbuf = typedTransformBuffers[key];
              if (tbuf) {
                tbuf[i] = val;
              }
            }
          }
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
