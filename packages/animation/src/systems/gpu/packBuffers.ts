import { Keyframe, TimelineData } from '@g-motion/core';

export interface PackedBuffers {
  trackDescriptors: Uint32Array;
  startTimeMs: Float32Array;
  endTimeMs: Float32Array;
  mode: Uint32Array;
  springMode: Uint32Array;
  stiffness: Float32Array;
  damping: Float32Array;
  mass: Float32Array;
  durationMs: Float32Array;
  initialVelocity: Float32Array;
  bezierCx1: Float32Array;
  bezierCy1: Float32Array;
  bezierCx2: Float32Array;
  bezierCy2: Float32Array;
  valueOffset: Uint32Array;
  valueLength: Uint32Array;
}

const MODE_MAP: Record<string, number> = {
  linear: 0,
  bezier: 1,
  hold: 2,
  spring: 3,
  inertia: 4,
  autoBezier: 5,
};

const SPRING_MODE_MAP: Record<string, number> = {
  none: 0,
  physics: 1,
  duration: 2,
};

/**
 * CPU-side packing of timeline data into SoA buffers suitable for GPU upload.
 * Not wired to GPU yet; provides deterministic structure matching contracts/gpu-buffer-layout.md.
 */
export function packTimelineToBuffers(tracks: TimelineData): PackedBuffers {
  const trackEntries = Array.from(tracks.entries());
  const segmentCount = trackEntries.reduce((acc, [, track]) => acc + track.length, 0);

  const startTimeMs = new Float32Array(segmentCount);
  const endTimeMs = new Float32Array(segmentCount);
  const mode = new Uint32Array(segmentCount);
  const springMode = new Uint32Array(segmentCount);
  const stiffness = new Float32Array(segmentCount);
  const damping = new Float32Array(segmentCount);
  const mass = new Float32Array(segmentCount);
  const durationMs = new Float32Array(segmentCount);
  const initialVelocity = new Float32Array(segmentCount);
  const bezierCx1 = new Float32Array(segmentCount);
  const bezierCy1 = new Float32Array(segmentCount);
  const bezierCx2 = new Float32Array(segmentCount);
  const bezierCy2 = new Float32Array(segmentCount);
  const valueOffset = new Uint32Array(segmentCount);
  const valueLength = new Uint32Array(segmentCount);

  const trackDescriptors = new Uint32Array(trackEntries.length * 4);

  let cursor = 0;
  trackEntries.forEach(([_trackId, track], trackIndex) => {
    const base = cursor;
    trackDescriptors[trackIndex * 4 + 0] = trackIndex;
    trackDescriptors[trackIndex * 4 + 1] = base;
    trackDescriptors[trackIndex * 4 + 2] = track.length;
    trackDescriptors[trackIndex * 4 + 3] = 0; // flags placeholder

    track.forEach((kf: Keyframe, idx: number) => {
      const ptr = base + idx;
      startTimeMs[ptr] = kf.startTime;
      endTimeMs[ptr] = kf.time;
      durationMs[ptr] = Math.max(0, kf.time - kf.startTime);
      mode[ptr] = MODE_MAP[kf.interp ?? 'linear'] ?? 0;

      if (kf.spring) {
        const springModeKey = (kf.spring as any).mode ?? 'physics';
        springMode[ptr] = SPRING_MODE_MAP[springModeKey] ?? 1;
        stiffness[ptr] = kf.spring.stiffness ?? 100;
        damping[ptr] = kf.spring.damping ?? 10;
        mass[ptr] = kf.spring.mass ?? 1;
        initialVelocity[ptr] = kf.spring.initialVelocity ?? 0;
      } else {
        springMode[ptr] = SPRING_MODE_MAP.none;
      }

      if (kf.bezier) {
        bezierCx1[ptr] = kf.bezier.cx1;
        bezierCy1[ptr] = kf.bezier.cy1;
        bezierCx2[ptr] = kf.bezier.cx2;
        bezierCy2[ptr] = kf.bezier.cy2;
      }

      valueOffset[ptr] = ptr; // simple monotonic mapping; real impl packs per property
      valueLength[ptr] = 1;
    });

    cursor += track.length;
  });

  return {
    trackDescriptors,
    startTimeMs,
    endTimeMs,
    mode,
    springMode,
    stiffness,
    damping,
    mass,
    durationMs,
    initialVelocity,
    bezierCx1,
    bezierCy1,
    bezierCx2,
    bezierCy2,
    valueOffset,
    valueLength,
  };
}
