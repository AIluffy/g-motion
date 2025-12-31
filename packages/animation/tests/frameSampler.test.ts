import { describe, it, expect } from 'vitest';
import { FrameSampler } from '../src/api/frameSampler';

describe('FrameSampler', () => {
  it('supports fractional fps time/frame conversions', () => {
    const sampler = new FrameSampler(23.976);
    const pos = sampler.timeToFramePosition(1000);
    expect(pos).toBeCloseTo(23.976, 6);

    const t = sampler.framePositionToTime(pos);
    expect(t).toBeCloseTo(1000, 6);
  });

  it('rounds frame indices correctly', () => {
    const sampler = new FrameSampler(10);
    expect(sampler.timeToFrameIndex(0, 'floor')).toBe(0);
    expect(sampler.timeToFrameIndex(99, 'floor')).toBe(0);
    expect(sampler.timeToFrameIndex(100, 'floor')).toBe(1);
    expect(sampler.timeToFrameIndex(150, 'round')).toBe(2);
    expect(sampler.timeToFrameIndex(150, 'ceil')).toBe(2);
  });

  it('splits frame position into integer frame and sub-frame', () => {
    const sampler = new FrameSampler(60);
    expect(sampler.splitFramePosition(10.25)).toEqual({ frame: 10, subFrame: 0.25 });
    expect(sampler.splitFramePosition(0)).toEqual({ frame: 0, subFrame: 0 });
  });

  it('seeks time by frame position with clamping', () => {
    const sampler = new FrameSampler(25);
    const duration = 1000;
    expect(sampler.seekTimeByFrame(100, { clampMs: { min: 0, max: duration } })).toBe(duration);
    expect(sampler.seekTimeByFrame(-1, { clampMs: { min: 0, max: duration } })).toBe(0);
  });

  it('interpolates between fractional frame positions', () => {
    const sampler = new FrameSampler(60);
    expect(sampler.interpolateFrame(10, 20, 0)).toBe(10);
    expect(sampler.interpolateFrame(10, 20, 1)).toBe(20);
    expect(sampler.interpolateFrame(10, 20, 0.5)).toBe(15);
  });
});
