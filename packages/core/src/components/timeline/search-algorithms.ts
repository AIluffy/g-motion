import { Track } from '../../types';

export function linearSearchKeyframe(track: Track, t: number): number {
  for (let i = track.length - 1; i >= 0; i--) {
    const kf = track[i];
    if (t >= kf.startTime) {
      if (t <= kf.time) {
        return i;
      }
      return i;
    }
  }
  return -1;
}

export function binarySearchKeyframe(track: Track, t: number): number {
  let left = 0;
  let right = track.length - 1;
  let searchResult = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const kf = track[mid];

    if (t >= kf.startTime && t <= kf.time) {
      return mid;
    }

    if (t < kf.startTime) {
      right = mid - 1;
    } else {
      searchResult = mid;
      left = mid + 1;
    }
  }

  return searchResult;
}
