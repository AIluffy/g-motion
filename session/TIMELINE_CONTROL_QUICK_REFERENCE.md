# Timeline Control Quick Reference

This guide summarizes the timeline control APIs available on `AnimationControl` returned by `motion(...).animate()`.

## Control APIs
- **seek(timeMs):** Jump to an absolute position in milliseconds. Clamps to `[0, duration]`.
- **getCurrentTime():** Returns the current absolute timeline time in ms.
- **getDuration():** Returns total timeline duration in ms.
- **setPlaybackRate(rate):** Sets playback speed multiplier (`1` = normal). Must be `> 0`.
- **getPlaybackRate():** Returns current playback rate.
- **setFps(fps):** Convenience for mapping desired FPS to playback rate, using `60` as baseline.
- **getFps():** Returns effective FPS computed from playback rate (baseline `60`).
- **play():** Resume playing from paused state; adjusts `startTime` for accurate elapsed time.
- **pause():** Pause playback; records `pausedAt` for accurate resume.
- **stop():** Finish the animation immediately.

## Usage Examples
```ts
import { motion } from '@g-motion/animation';

// Build and start
const ctrl = motion(0)
  .mark({ to: 100, duration: 500 })
  .mark({ to: 200, duration: 500 })
  .animate();

// Seek and inspect
ctrl.seek(400);
console.log(ctrl.getCurrentTime()); // 400
console.log(ctrl.getDuration());    // 1000

// FPS / playback rate
ctrl.setFps(120);                   // doubles speed
console.log(ctrl.getFps());         // ~120
ctrl.setPlaybackRate(0.5);          // half speed
console.log(ctrl.getFps());         // ~30

// Pause / play
ctrl.pause();
// ... later
ctrl.play();
```

## Notes
- FPS mapping assumes a default baseline of `60`. `setFps(fps)` internally sets `playbackRate = fps / 60`.
- `seek()` updates `MotionState.currentTime` directly; systems will render the appropriate state on the next frame.
- For spring or inertia-driven segments, completion is governed by physics systems; timeline duration clamping still applies to non-physics tracks.
