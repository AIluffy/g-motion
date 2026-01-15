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

export const InterpolationSystem: SystemDef = {
  name: 'InterpolationSystem',
  order: 20,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) return;

    const config = (ctx?.services.config ?? world.config) as any;
    const tickFrame = resolveTickFrame(ctx, config);
    const channelRegistry = resolveChannelRegistry(ctx, config);
    if (channelRegistry === false) return;

    const timelineFlatEnabled = config.timelineFlat === true;
    const toProcess = resolveArchetypesToProcess(world, config);
    for (const archetype of toProcess) {
      processArchetype(archetype, tickFrame, channelRegistry, timelineFlatEnabled);
    }
  },
};

function resolveChannelRegistry(
  ctx: SystemContext | undefined,
  config: any,
): ReturnType<typeof getGPUChannelMappingRegistry> | null | false {
  const metrics = ctx?.services.metrics;
  const gpuMode = (config?.gpuCompute ?? 'always') as GPUComputeMode;

  let gpuActive = false;
  if (gpuMode !== 'never' && metrics) {
    const status = metrics.getStatus();
    gpuActive = !!status.enabled && !!status.gpuInitialized && !status.cpuFallbackActive;
  }

  const gpuOnlyInterpolation = gpuActive && config?.gpuOnlyInterpolation === true;
  if (gpuOnlyInterpolation) {
    return false;
  }

  return gpuActive ? getGPUChannelMappingRegistry() : null;
}

function resolveTickFrame(ctx: SystemContext | undefined, config: any): number {
  if ((config as any).samplingMode === 'frame' && typeof ctx?.sampling?.frame === 'number') {
    return ctx!.sampling!.frame;
  }

  if (typeof ctx?.sampling?.engineFrame === 'number') {
    return ctx.sampling.engineFrame;
  }

  if (typeof ctx?.nowMs === 'number' && Number.isFinite(ctx.nowMs)) {
    return Math.floor(ctx.nowMs / (1000 / 60));
  }

  return 0;
}

function resolveArchetypesToProcess(world: any, config: any): Iterable<any> {
  const slice = config?.workSlicing as
    | { enabled?: boolean; interpolationArchetypesPerFrame?: number }
    | undefined;
  const perFrame = slice?.enabled ? slice.interpolationArchetypesPerFrame : undefined;
  if (!(typeof perFrame === 'number' && Number.isFinite(perFrame))) {
    return world.getArchetypes();
  }

  archetypeScratch.length = 0;
  for (const a of world.getArchetypes()) archetypeScratch.push(a);
  const len = archetypeScratch.length;
  if (len === 0) return [];

  const limit = Math.max(1, Math.min(Math.floor(perFrame), len));
  const start = ((archetypeCursor % len) + len) % len;
  pickedArchetypesScratch.length = 0;
  const picked = pickedArchetypesScratch;
  for (let n = 0; n < limit; n++) {
    picked.push(archetypeScratch[(start + n) % len]);
  }
  archetypeCursor = (start + limit) % len;
  return picked;
}

const WRITE_HANDLED = 1;
const WRITE_CHANGED = 2;

function processArchetype(
  archetype: any,
  tickFrame: number,
  channelRegistry: any,
  timelineFlatEnabled: boolean,
): void {
  const stateBuffer = archetype.getBuffer('MotionState');
  const timelineBuffer = archetype.getBuffer('Timeline');
  const springBuffer = archetype.getBuffer('Spring');
  const inertiaBuffer = archetype.getBuffer('Inertia');

  const renderBuffer = archetype.getBuffer('Render');
  const transformBuffer = archetype.getBuffer('Transform');

  const typedTransformBuffers = extractTransformTypedBuffers(archetype);
  const typedStatus = archetype.getTypedBuffer('MotionState', 'status');
  const typedCurrentTime = archetype.getTypedBuffer('MotionState', 'currentTime');
  const typedTickInterval = archetype.getTypedBuffer('MotionState', 'tickInterval');
  const typedTickPhase = archetype.getTypedBuffer('MotionState', 'tickPhase');

  if (!stateBuffer || !timelineBuffer) return;

  const gpuPropsForArchetype = resolveGPUPropsForArchetype(channelRegistry, archetype.id);

  for (let i = 0; i < archetype.entityCount; i++) {
    if ((springBuffer && springBuffer[i]) || (inertiaBuffer && inertiaBuffer[i])) {
      continue;
    }

    const state = stateBuffer[i] as MotionStateComponentData;
    const timeline = timelineBuffer[i] as TimelineComponentData & {
      tracks: Map<string, unknown>;
    };

    const status = typedStatus ? (typedStatus[i] as unknown as MotionStatus) : state.status;
    if (status !== MotionStatus.Running && status !== MotionStatus.Finished) continue;

    if (
      !shouldInterpolateThisTick(status, tickFrame, i, typedTickInterval, typedTickPhase, state)
    ) {
      continue;
    }

    const render = renderBuffer ? (renderBuffer[i] as RenderComponentData) : undefined;
    let changed = false;
    if (render && !render.props) {
      render.props = {};
      changed = true;
    }

    const t = typedCurrentTime ? typedCurrentTime[i] : state.currentTime;

    if (timelineFlatEnabled) {
      const tracks = timeline.tracks as any;
      const keys = Array.isArray(tracks?.flatKeys) ? (tracks.flatKeys as string[]) : undefined;
      const values = Array.isArray(tracks?.flatValues)
        ? (tracks.flatValues as unknown[])
        : undefined;
      if (keys && values) {
        for (let tIndex = 0; tIndex < keys.length; tIndex++) {
          if (
            processTrackKey(
              keys[tIndex],
              values[tIndex],
              t,
              i,
              gpuPropsForArchetype,
              transformBuffer,
              renderBuffer,
              typedTransformBuffers,
            )
          ) {
            changed = true;
          }
        }
      } else {
        for (const [key, track] of timeline.tracks) {
          if (
            processTrackKey(
              key,
              track,
              t,
              i,
              gpuPropsForArchetype,
              transformBuffer,
              renderBuffer,
              typedTransformBuffers,
            )
          ) {
            changed = true;
          }
        }
      }
    } else {
      for (const [key, track] of timeline.tracks) {
        if (
          processTrackKey(
            key,
            track,
            t,
            i,
            gpuPropsForArchetype,
            transformBuffer,
            renderBuffer,
            typedTransformBuffers,
          )
        ) {
          changed = true;
        }
      }
    }

    if (changed && render) {
      render.version = (render.version ?? 0) + 1;
    }
  }
}

function processTrackKey(
  key: string,
  track: unknown,
  t: number,
  index: number,
  gpuPropsForArchetype: Set<string> | null,
  transformBuffer: unknown,
  renderBuffer: unknown,
  typedTransformBuffers: any,
): boolean {
  if (gpuPropsForArchetype && gpuPropsForArchetype.has(key)) {
    return false;
  }

  const activeKf = findActiveKeyframe(track as any, t) as any;
  if (!activeKf) return false;

  const val = interpolateKeyframe(activeKf, t);

  if (transformBuffer) {
    const res = writeTransformValues(key, val, index, transformBuffer, typedTransformBuffers);
    if (res & WRITE_CHANGED) return true;
    if (res & WRITE_HANDLED) return false;
  }

  if (!renderBuffer) return false;
  return writeRenderValues(key, val, index, renderBuffer, typedTransformBuffers);
}

function resolveGPUPropsForArchetype(
  channelRegistry: any,
  archetypeId: string,
): Set<string> | null {
  if (!channelRegistry) return null;
  const table = channelRegistry.getChannels(archetypeId);
  if (!table || !table.channels || table.channels.length === 0) return null;
  const props = new Set<string>();
  for (const ch of table.channels) {
    props.add(ch.property);
  }
  return props;
}

function shouldInterpolateThisTick(
  status: MotionStatus,
  tickFrame: number,
  index: number,
  typedTickInterval: any,
  typedTickPhase: any,
  state: MotionStateComponentData,
): boolean {
  if (status !== MotionStatus.Running) return true;
  const interval = typedTickInterval ? typedTickInterval[index] : Number(state.tickInterval ?? 0);
  if (interval <= 1) return true;
  const phase = typedTickPhase ? typedTickPhase[index] : Number(state.tickPhase ?? 0);
  return (tickFrame + phase) % interval === 0;
}

function interpolateKeyframe(activeKf: any, t: number): any {
  const mode = resolveInterpMode(activeKf);
  const { progress } = getProgress(t, activeKf);

  if (mode === 'hold') {
    if (activeKf.__valueInterp === 'registry') {
      const fromRaw = activeKf.__from ?? activeKf.startValue;
      const toRaw = activeKf.__to ?? activeKf.endValue;
      return defaultRegistry.interpolate(fromRaw, toRaw, progress);
    }
    return activeKf.endValue;
  }

  const eased = resolveEasedProgress(activeKf, mode, progress);
  const numericVal = activeKf.startValue + (activeKf.endValue - activeKf.startValue) * eased;
  if (activeKf.__valueInterp === 'registry') {
    const fromRaw = activeKf.__from ?? activeKf.startValue;
    const toRaw = activeKf.__to ?? activeKf.endValue;
    return defaultRegistry.interpolate(fromRaw, toRaw, eased);
  }
  return numericVal;
}

function resolveEasedProgress(activeKf: any, mode: string, progress: number): number {
  if (mode === 'bezier' && activeKf.bezier) {
    return cubicBezier(
      activeKf.bezier.cx1,
      activeKf.bezier.cy1,
      activeKf.bezier.cx2,
      activeKf.bezier.cy2,
      progress,
    );
  }
  if (mode === 'autoBezier') {
    const { cx1, cy1, cx2, cy2 } = AUTO_BEZIER_DEFAULTS;
    return cubicBezier(cx1, cy1, cx2, cy2, progress);
  }
  if (activeKf.easing) {
    const easingFn = resolveEasing(activeKf.easing);
    return easingFn(progress);
  }
  return progress;
}

function writeTransformValues(
  key: string,
  val: any,
  index: number,
  transformBuffer: any,
  typedTransformBuffers: any,
): number {
  const transform = transformBuffer[index] as TransformComponentData;
  if (!transform) return 0;

  if (key === 'scale') {
    let scaleChanged = false;
    if (typedTransformBuffers.scaleX) {
      if (!Object.is(typedTransformBuffers.scaleX[index], val)) {
        typedTransformBuffers.scaleX[index] = val;
        scaleChanged = true;
      }
    }
    if (typedTransformBuffers.scaleY) {
      if (!Object.is(typedTransformBuffers.scaleY[index], val)) {
        typedTransformBuffers.scaleY[index] = val;
        scaleChanged = true;
      }
    }
    if (typedTransformBuffers.scaleZ) {
      if (!Object.is(typedTransformBuffers.scaleZ[index], val)) {
        typedTransformBuffers.scaleZ[index] = val;
        scaleChanged = true;
      }
    }

    if (scaleChanged) {
      transform.scaleX = val;
      transform.scaleY = val;
      if ('scaleZ' in transform) {
        (transform as any).scaleZ = val;
      }
      return WRITE_HANDLED | WRITE_CHANGED;
    }

    let changed = false;
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
    return WRITE_HANDLED | (changed ? WRITE_CHANGED : 0);
  }

  if (!(key in transform)) return 0;

  const tbuf = typedTransformBuffers[key];
  if (tbuf) {
    if (!Object.is(tbuf[index], val)) {
      tbuf[index] = val;
      (transform as Record<string, number>)[key] = val;
      return WRITE_HANDLED | WRITE_CHANGED;
    }
    return WRITE_HANDLED;
  }

  const obj = transform as Record<string, number>;
  if (!Object.is(obj[key], val)) {
    obj[key] = val;
    return WRITE_HANDLED | WRITE_CHANGED;
  }
  return WRITE_HANDLED;
}

function writeRenderValues(
  key: string,
  val: any,
  index: number,
  renderBuffer: any,
  typedTransformBuffers: any,
): boolean {
  const r = renderBuffer[index] as RenderComponentData;
  if (!r) return false;
  r.props ||= {};

  const tbuf = typedTransformBuffers[key];
  if (tbuf) {
    if (!Object.is(tbuf[index], val)) {
      tbuf[index] = val;
      (r.props as any)[key] = val;
      return true;
    }
    return false;
  }

  const prev = (r.props as any)[key];
  if (!Object.is(prev, val)) {
    (r.props as any)[key] = val;
    return true;
  }
  return false;
}

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

const AUTO_BEZIER_DEFAULTS = {
  cx1: 0.25,
  cy1: 0.1,
  cx2: 0.25,
  cy2: 1,
};
