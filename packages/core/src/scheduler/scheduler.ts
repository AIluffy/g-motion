import { getNowMs, isDev } from '@g-motion/shared';
import { getGPUModuleSync } from '../runtime/gpu-access';
import { WebGPUConstants } from '../constants';
import type { EngineServices, SystemDef } from '../runtime/plugin';
import { SchedulerLoop } from './loop';
import { SchedulerProcessor } from './processor';
import { WorldProvider } from '../runtime/world-provider';

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
      const gpu = getGPUModuleSync();
      const hasPendingGPUWork =
        (gpu?.getPendingReadbackCount?.() ?? 0) > 0 || (gpu?.getGPUResultQueueLength?.() ?? 0) > 0;
      return this.activeEntityCount > 0 || hasPendingGPUWork || now < keepAliveUntil;
    },
  });

  get isRunning(): boolean {
    return this.loopRunner.isRunning();
  }

  setServices(services: EngineServices): void {
    this.services = services;
    getGPUModuleSync()?.setGPUResultWakeup?.(this.wakeForGPUResults);
  }

  clearServices(): void {
    this.services = undefined;
    getGPUModuleSync()?.setGPUResultWakeup?.(undefined);
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

    if (isDev()) {
      this.validateNoWriteConflicts(system);
    }

    this.systems.push(system);
    this.systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private validateNoWriteConflicts(newSystem: SystemDef): void {
    const phase = newSystem.phase ?? 'update';
    const order = newSystem.order ?? 0;
    const writes = new Set(newSystem.writes ?? []);
    if (writes.size === 0) return;

    for (const existing of this.systems) {
      if ((existing.phase ?? 'update') !== phase) continue;
      if ((existing.order ?? 0) !== order) continue;
      if (existing.name === newSystem.name) continue;

      for (const w of existing.writes ?? []) {
        if (writes.has(w)) {
          console.warn(
            `[g-motion] System "${newSystem.name}" and "${existing.name}" ` +
              `both write to "${w}" at phase="${phase}" order=${order}. ` +
              `This may cause non-deterministic behavior. ` +
              `Consider assigning different order values.`,
          );
        }
      }
    }
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
