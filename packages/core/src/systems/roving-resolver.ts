import { SystemContext, SystemDef } from '../plugin';
import type { Keyframe, TimelineComponentData } from '../types';

type GaussianKernel = { weights: number[]; radius: number };

type RovingKeyframe = Partial<Keyframe>;

const DEFAULT_SMOOTH_KERNEL: GaussianKernel = (() => {
  const radius = 2; // window = 2*radius+1 => 5
  const sigma = 1;
  const weights: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(w);
    sum += w;
  }
  return { radius, weights: weights.map((w) => w / sum) };
})();

export function smooth(values: number[], kernel: GaussianKernel): number[] {
  const out: number[] = Array.from({ length: values.length }, () => 0);
  const { radius, weights } = kernel;
  for (let i = 0; i < values.length; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = Math.min(values.length - 1, Math.max(0, i + k));
      const weight = weights[k + radius];
      acc += values[idx] * weight;
    }
    out[i] = acc;
  }
  return out;
}

export function distributeDurations(lengths: number[], totalDuration: number): number[] {
  const sum = lengths.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const even = totalDuration / (lengths.length || 1);
    return lengths.map(() => even);
  }
  return lengths.map((len) => (len / sum) * totalDuration);
}

// Roving resolver: assigns times to keyframes lacking explicit times using arc-length + smoothing.
// Operates per track; uses value delta magnitude as segment length surrogate.
export const RovingResolverSystem: SystemDef = {
  name: 'RovingResolverSystem',
  order: 12,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) {
      return;
    }
    for (const archetype of world.getArchetypes()) {
      const timelineBuffer = archetype.getBuffer('Timeline');
      const typedVersion = archetype.getTypedBuffer('Timeline', 'version');
      const typedApplied = archetype.getTypedBuffer('Timeline', 'rovingApplied');
      if (!timelineBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const timelineValue = timelineBuffer[i];
        if (!timelineValue) continue;
        const timeline = timelineValue as TimelineComponentData;

        const ver = typedVersion ? typedVersion[i] : (timeline.version ?? 0);
        const applied = typedApplied ? typedApplied[i] : (timeline.rovingApplied ?? 0);
        if (applied === ver) {
          continue;
        }
        const tracks = timeline.tracks;
        if (!tracks || tracks.size === 0) {
          if (typedApplied) {
            typedApplied[i] = ver;
          } else {
            timeline.rovingApplied = ver;
          }
          continue;
        }
        let durationDirty = false;

        for (const [, track] of tracks) {
          if (!track || track.length === 0) continue;

          const rovingTrack = track as unknown as RovingKeyframe[];
          const needsRoving = rovingTrack.some((kf) => !Number.isFinite(kf.time ?? NaN));
          if (!needsRoving) continue;

          // Estimate per-segment length via absolute delta of values
          const lengths: number[] = [];
          for (let idx = 0; idx < rovingTrack.length; idx++) {
            const prevVal =
              idx === 0 ? (rovingTrack[idx].startValue ?? 0) : (rovingTrack[idx - 1].endValue ?? 0);
            const curVal = rovingTrack[idx].endValue ?? 0;
            lengths.push(Math.abs(curVal - prevVal));
          }

          const smoothedLengths = smooth(lengths, DEFAULT_SMOOTH_KERNEL);
          const totalDuration = Number.isFinite(timeline.duration ?? NaN)
            ? timeline.duration!
            : 1000;
          const durations = distributeDurations(smoothedLengths, totalDuration);

          // Assign times cumulatively
          let cursor = 0;
          for (let idx = 0; idx < rovingTrack.length; idx++) {
            const dur = durations[idx] ?? 0;
            rovingTrack[idx].startTime = cursor;
            rovingTrack[idx].time = cursor + dur;
            cursor += dur;
          }

          // Keep timeline duration aligned with last mark
          const prevDuration = Number.isFinite(timeline.duration ?? NaN) ? timeline.duration! : 0;
          timeline.duration = Math.max(prevDuration, cursor);
          durationDirty = true;
        }

        if (durationDirty) {
          // Ensure tracks remain sorted by time to preserve deterministic evaluation
          for (const [key, track] of tracks) {
            tracks.set(
              key,
              [...track].sort((a, b) => (a.time ?? 0) - (b.time ?? 0)),
            );
          }
        }

        // mark roving applied equals to current version
        if (typedApplied) {
          typedApplied[i] = ver;
        } else {
          timeline.rovingApplied = ver;
        }
      }
    }
  },
};
