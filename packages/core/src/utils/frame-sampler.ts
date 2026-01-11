import { SchedulingConstants } from '../constants/scheduling';

export type FrameSamplerConfig = {
  samplingFps?: number;
  targetFps?: number;
};

export type FrameSamplingState = {
  fps: number;
  framePosition: number;
  frame: number;
  deltaFrame: number;
  deltaTimeMs: number;
};

export class FrameSampler {
  private lastFps = 0;
  private lastFrame = 0;

  compute(elapsedMs: number, config: FrameSamplerConfig): FrameSamplingState {
    const samplingFps = Number(
      config.samplingFps ?? config.targetFps ?? SchedulingConstants.DEFAULT_SAMPLING_FPS,
    );
    const fps =
      Number.isFinite(samplingFps) && samplingFps > 0
        ? samplingFps
        : SchedulingConstants.DEFAULT_SAMPLING_FPS;
    const framePosition = (elapsedMs * fps) / 1000;
    const frame = Math.floor(framePosition + 1e-9);

    let deltaFrame = 0;
    if (!Object.is(this.lastFps, fps)) {
      this.lastFps = fps;
      this.lastFrame = frame;
    } else {
      deltaFrame = Math.max(0, frame - this.lastFrame);
      this.lastFrame = frame;
    }

    const deltaTimeMs = (deltaFrame * 1000) / fps;

    return {
      fps,
      framePosition,
      frame,
      deltaFrame,
      deltaTimeMs,
    };
  }
}
