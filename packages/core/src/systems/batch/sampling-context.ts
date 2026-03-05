/**
 * Sampling Context Helpers
 *
 * Frame-level setup utilities consumed by BatchSamplingSystem to keep
 * the orchestrator's update() body ≤150 lines.
 *
 * Exports:
 *   buildFrameContext()  – derive per-frame constants from SystemContext + world config
 *   sliceArchetypes()    – apply work-slicing to select which archetypes to process
 */

import type {
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
} from '../../runtime/gpu-types';
import type { Archetype } from '../../ecs/archetype';
import { SchedulingConstants } from '../../constants';
import type { SystemContext } from '../../runtime/plugin';
import {
  getArchetypeCursor,
  getArchetypeScratch,
  getPickedArchetypesScratch,
  incrementFrameId,
  setArchetypeCursor,
} from './utils';

export interface FrameContext {
  nowMs: number;
  tickFrame: number;
  timelineFlatEnabled: boolean;
  staticReuseEnabled: boolean;
  seekInvalidation: boolean;
  preprocessEnabled: boolean;
  preprocessOptions: RawKeyframeGenerationOptions;
  evaluateRawValue: RawKeyframeValueEvaluator;
}

/**
 * Derive all per-frame constants from the system context and world config.
 * Also consumes the batch-sampling seek-invalidation flag (side-effect).
 */
export function buildFrameContext(ctx: SystemContext, seekInvalidation: boolean): FrameContext {
  const config = ctx.services.world!.config;
  const nowMs = typeof ctx.nowMs === 'number' ? ctx.nowMs : Date.now();
  const engineFrame =
    typeof ctx.sampling?.engineFrame === 'number' ? ctx.sampling.engineFrame : incrementFrameId();
  const tickFrame =
    config.samplingMode === 'frame' && typeof ctx.sampling?.frame === 'number'
      ? ctx.sampling.frame
      : engineFrame;
  const preprocessConfig = config.keyframe?.preprocess;
  const preprocessOptions: RawKeyframeGenerationOptions = {
    timeInterval:
      preprocessConfig?.timeInterval ?? SchedulingConstants.DEFAULT_KEYFRAME_INTERVAL_MS,
    maxSubdivisionsPerSegment: preprocessConfig?.maxSubdivisionsPerSegment ?? 4,
  };
  const evaluateRawValue: RawKeyframeValueEvaluator = (kf, t) => {
    const d = kf.time - kf.startTime;
    return d > 0
      ? kf.startValue + (kf.endValue - kf.startValue) * ((t - kf.startTime) / d)
      : kf.endValue;
  };
  return {
    nowMs,
    tickFrame,
    timelineFlatEnabled: config.keyframe?.timelineFlat === true,
    staticReuseEnabled: config.batchSamplingStaticReuse === true,
    seekInvalidation,
    preprocessEnabled: !!preprocessConfig?.enabled,
    preprocessOptions,
    evaluateRawValue,
  };
}

/**
 * Return the set of archetypes to process this frame, applying the
 * `batchSamplingArchetypesPerFrame` work-slicing limit when configured.
 * Returns `undefined` when the archetype list is empty.
 */
export function sliceArchetypes(
  archetypes: Iterable<Archetype>,
  perFrame: number | undefined,
  seekInvalidation: boolean,
): Iterable<Archetype> | undefined {
  const perFrameNum =
    !seekInvalidation && typeof perFrame === 'number' && Number.isFinite(perFrame)
      ? perFrame
      : undefined;
  if (perFrameNum === undefined) return archetypes;

  const s = getArchetypeScratch();
  s.length = 0;
  for (const a of archetypes) s.push(a);
  if (!s.length) return undefined;
  const limit = Math.max(1, Math.min(Math.floor(perFrameNum), s.length));
  const start = ((getArchetypeCursor() % s.length) + s.length) % s.length;
  const p = getPickedArchetypesScratch();
  p.length = 0;
  for (let n = 0; n < limit; n++) p.push(s[(start + n) % s.length]);
  setArchetypeCursor((start + limit) % s.length);
  return p;
}
