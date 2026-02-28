import { describe, it, expect } from 'vitest';
import { motion } from '../src/api/builder';

describe('MotionBuilder mark() single vs array', () => {
  it('accepts single mark and builds same timeline as array', () => {
    const single = motion(0).mark({ to: 100, at: 500 }).toJSON();
    const array = motion(0)
      .mark([{ to: 100, at: 500 }])
      .toJSON();
    expect(single.motion.timeline.duration).toBe(array.motion.timeline.duration);
    expect(single.motion.tracks.length).toBe(array.motion.tracks.length);
    expect(single.motion.tracks[0].marks[0].to).toBe(100);
    expect(single.motion.tracks[0].marks[0].time).toBe(500);
  });
});
