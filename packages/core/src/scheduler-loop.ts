import { SCHEDULER_LIMITS } from './constants';
import { getNowMs } from '@g-motion/utils';

export class SchedulerLoop {
  private running = false;
  private lastTime = 0;
  private frameId = 0;
  private keepAliveUntil = 0;

  constructor(
    private readonly deps: {
      hasServices: () => boolean;
      getFrameDurationMs: () => number | undefined;
      processFrame: (dtMs: number) => void;
      shouldContinue: (now: number, keepAliveUntil: number) => boolean;
    },
  ) {}

  start(): void {
    if (this.running) return;
    if (!this.deps.hasServices()) return;
    this.running = true;
    this.lastTime = getNowMs();
    this.loop();
  }

  stop(): void {
    this.running = false;
    this.keepAliveUntil = 0;
    if (this.frameId) cancelAnimationFrame(this.frameId);
  }

  isRunning(): boolean {
    return this.running;
  }

  extendKeepAlive(untilMs: number): void {
    this.keepAliveUntil = Math.max(this.keepAliveUntil, untilMs);
  }

  wakeForGPUResults(tailMs: number): void {
    if (!this.deps.hasServices()) return;
    const now = getNowMs();
    this.extendKeepAlive(now + tailMs);
    if (this.running) return;
    this.running = true;
    this.lastTime = now;
    this.loop();
  }

  private loop = (): void => {
    if (!this.running) return;
    if (!this.deps.hasServices()) {
      this.running = false;
      return;
    }

    const time = getNowMs();
    const dt = time - this.lastTime;
    const frameDuration = this.deps.getFrameDurationMs();
    if (frameDuration) {
      const threshold = Math.max(0, frameDuration - 1);
      if (dt < threshold) {
        this.frameId = requestAnimationFrame(this.loop);
        return;
      }
    }

    this.lastTime = time;
    const safeDt = Math.min(dt, SCHEDULER_LIMITS.MAX_FRAME_TIME_MS);
    this.deps.processFrame(safeDt);

    const now = time;
    if (!this.deps.shouldContinue(now, this.keepAliveUntil)) {
      this.running = false;
      return;
    }

    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : undefined;
    if (!raf) {
      this.running = false;
      return;
    }
    this.frameId = raf(this.loop);
  };
}
