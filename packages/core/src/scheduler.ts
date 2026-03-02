import { getNowMs } from '@g-motion/shared';
import {
  getGPUResultQueueLength,
  getPendingReadbackCount,
  setGPUResultWakeup,
} from '@g-motion/webgpu/internal';
import { WebGPUConstants } from './constants';
import type { EngineServices, SystemDef } from './plugin';
import { SchedulerLoop } from './scheduler-loop';
import { SchedulerProcessor } from './scheduler-processor';
import { WorldProvider } from './worldProvider';

const GPU_TAIL_KEEP_ALIVE_MS = WebGPUConstants.GPU.TAIL_KEEP_ALIVE_MS;

export class SystemScheduler {
  private systems: SystemDef[] = [];
  private activeEntityCount = 0;

  private services?: EngineServices;

  private processor = new SchedulerProcessor();
  private loopRunner = new SchedulerLoop({
    hasServices: () => !!this.services,
    getFrameDurationMs: () =>
      this.services?.config.frameDuration ?? this.getWorld()?.config.frameDuration,
    processFrame: (dtMs: number) => {
      const services = this.services;
      if (!services) return;
      this.processor.processFrame({
        dtMs,
        services,
        systems: this.systems,
        getWorld: this.getWorld,
      });
    },
    shouldContinue: (now: number, keepAliveUntil: number) => {
      const hasPendingGPUWork = getPendingReadbackCount() > 0 || getGPUResultQueueLength() > 0;
      return this.activeEntityCount > 0 || hasPendingGPUWork || now < keepAliveUntil;
    },
  });

  get isRunning(): boolean {
    return this.loopRunner.isRunning();
  }

  setServices(services: EngineServices): void {
    this.services = services;
    setGPUResultWakeup(this.wakeForGPUResults);
  }

  clearServices(): void {
    this.services = undefined;
    setGPUResultWakeup(undefined);
  }

  private getWorld() {
    if (this.services?.world) {
      return this.services.world;
    }
    try {
      return WorldProvider.useWorld();
    } catch {
      return null;
    }
  }

  setActiveEntityCount(count: number): void {
    this.activeEntityCount = count;

    // Auto-start if we have active entities but scheduler is not running
    if (count > 0) {
      this.start();
    }
    // Auto-stop if no active entities and scheduler is running
    else if (count === 0) {
      const now = getNowMs();
      this.loopRunner.extendKeepAlive(now + GPU_TAIL_KEEP_ALIVE_MS);
    }
  }

  getActiveEntityCount(): number {
    return this.activeEntityCount;
  }

  add(system: SystemDef): void {
    if (this.systems.some((s) => s.name === system.name)) return;
    this.systems.push(system);
    this.systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  start(): void {
    if (!this.services) return;
    if (this.loopRunner.isRunning()) return;
    this.processor.resetClock();
    this.loopRunner.start();
  }

  ensureRunning(): void {
    this.start();
  }

  stop(): void {
    this.loopRunner.stop();
  }

  private wakeForGPUResults = (): void => {
    this.loopRunner.wakeForGPUResults(GPU_TAIL_KEEP_ALIVE_MS);
  };
}
