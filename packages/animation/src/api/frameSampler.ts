export type FrameRoundingMode = 'floor' | 'ceil' | 'round';

export class FrameSampler {
  readonly fps: number;
  readonly frameDurationMs: number;
  private readonly framesPerMs: number;

  constructor(fps: number) {
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new Error(`[FrameSampler] fps must be a positive finite number, got: ${fps}`);
    }
    this.fps = fps;
    this.frameDurationMs = 1000 / fps;
    this.framesPerMs = fps / 1000;
  }

  timeToFramePosition(timeMs: number): number {
    if (!Number.isFinite(timeMs)) return 0;
    return timeMs * this.framesPerMs;
  }

  framePositionToTime(framePosition: number): number {
    if (!Number.isFinite(framePosition)) return 0;
    return framePosition * this.frameDurationMs;
  }

  timeToFrameIndex(timeMs: number, mode: FrameRoundingMode = 'floor'): number {
    const pos = this.timeToFramePosition(timeMs);
    if (mode === 'ceil') return Math.ceil(pos);
    if (mode === 'round') return Math.round(pos);
    return Math.floor(pos);
  }

  splitFramePosition(framePosition: number): { frame: number; subFrame: number } {
    if (!Number.isFinite(framePosition)) return { frame: 0, subFrame: 0 };
    const frame = Math.floor(framePosition);
    const subFrame = framePosition - frame;
    return { frame, subFrame };
  }

  seekTimeByFrame(
    framePosition: number,
    params?: { clampMs?: { min: number; max: number } },
  ): number {
    let timeMs = this.framePositionToTime(framePosition);
    const clamp = params?.clampMs;
    if (clamp) {
      timeMs = Math.max(clamp.min, Math.min(timeMs, clamp.max));
    }
    return timeMs;
  }

  interpolateFrame(fromFramePosition: number, toFramePosition: number, t: number): number {
    if (!Number.isFinite(t)) return fromFramePosition;
    const clamped = Math.max(0, Math.min(1, t));
    return fromFramePosition + (toFramePosition - fromFramePosition) * clamped;
  }
}
