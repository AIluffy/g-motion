import { TimelineData } from '@g-motion/core';

export interface AdjustParams {
  offset?: number;
  scale?: number;
}

export function applyAdjust(tracks: TimelineData, params: AdjustParams): TimelineData {
  const offset = params.offset ?? 0;
  const scale = params.scale ?? 1;
  const adjusted = new Map<string, any>();

  for (const [key, track] of tracks.entries()) {
    const newTrack = track
      .map((kf, idx) => {
        const startTime = kf.startTime * scale + offset;
        const endTime = kf.time * scale + offset;
        return {
          ...kf,
          startTime,
          time: endTime,
          _order: idx, // preserve stable order for collision resolution
        };
      })
      .sort((a, b) => {
        if (a.time === b.time) return a._order - b._order;
        return a.time - b.time;
      })
      .map((kf, idx, arr) => {
        const prevEnd = idx === 0 ? kf.startTime : arr[idx - 1].time;
        const safeStart = Math.max(kf.startTime, prevEnd);
        const safeEnd = Math.max(kf.time, safeStart);
        const { _order, ...rest } = kf;
        return {
          ...rest,
          startTime: safeStart,
          time: safeEnd,
        };
      });
    adjusted.set(key, newTrack);
  }

  return adjusted as TimelineData;
}
