import { describe, it, expect } from 'vitest';
import { motion } from '../src/api/builder';
// World is initialized by builder/animate; no explicit reset required

describe('AnimationControl seek & getters', () => {
  it('seeks within duration and reports time/duration', () => {
    // Initialize world via animate
    const ctrl = motion(0)
      .mark([{ to: 100, duration: 500 }])
      .mark([{ to: 200, duration: 500 }])
      .animate();

    // Duration should be 1000
    expect(ctrl.getDuration()).toBe(1000);

    // Seek to middle
    ctrl.seek(400);
    expect(ctrl.getCurrentTime()).toBe(400);

    // Clamp over end
    ctrl.seek(5000);
    expect(ctrl.getCurrentTime()).toBe(1000);

    // Clamp below zero
    ctrl.seek(-10);
    expect(ctrl.getCurrentTime()).toBe(0);
  });

  it('maps fps to playbackRate and back', () => {
    // Initialize world via animate
    const ctrl = motion(0)
      .mark([{ to: 100, duration: 1000 }])
      .animate();

    // Default playbackRate -> 60 fps
    expect(Math.round(ctrl.getFps())).toBe(60);

    ctrl.setFps(120);
    expect(Math.round(ctrl.getFps())).toBe(120);

    // Playback rate getter/setter
    ctrl.setPlaybackRate(0.5);
    expect(ctrl.getPlaybackRate()).toBe(0.5);
    expect(Math.round(ctrl.getFps())).toBe(30);
  });
});
