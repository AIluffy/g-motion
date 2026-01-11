import type { EngineServices, MotionAppConfig, SystemContext, SystemDef } from './plugin';
import { WorldProvider } from './worldProvider';
import { SCHEDULER_LIMITS, WebGPUConstants } from './constants';
import { FrameSampler } from './utils';
import { getErrorHandler } from './context';
import { ErrorCode, ErrorSeverity, MotionError } from './errors';
import {
  getGPUResultQueueLength,
  getPendingReadbackCount,
  setGPUResultWakeup,
} from './webgpu/sync-manager';
import { getPersistentGPUBufferManager } from './webgpu/persistent-buffer-manager';

const GPU_TAIL_KEEP_ALIVE_MS = WebGPUConstants.GPU.TAIL_KEEP_ALIVE_MS;

export class SystemScheduler {
  private systems: SystemDef[] = [];
  private isRunning = false;
  private lastTime = 0;
  private frameId = 0;
  private activeEntityCount = 0;
  private metricsCounter = 0;
  private keepAliveUntil = 0;
  private engineFrame = 0;
  private elapsedMs = 0;

  private services?: EngineServices;

  private frameSampler = new FrameSampler();

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

  private capabilities = {
    webgpu: false,
  };

  setCapability(cap: 'webgpu', value: boolean) {
    this.capabilities[cap] = value;
  }

  getCapability(cap: 'webgpu') {
    return this.capabilities[cap];
  }

  setActiveEntityCount(count: number): void {
    this.activeEntityCount = count;

    // Auto-start if we have active entities but scheduler is not running
    if (count > 0 && !this.isRunning) {
      this.start();
    }
    // Auto-stop if no active entities and scheduler is running
    else if (count === 0 && this.isRunning) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.keepAliveUntil = Math.max(this.keepAliveUntil, now + GPU_TAIL_KEEP_ALIVE_MS);
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
    if (this.isRunning) return;
    if (!this.services) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.engineFrame = 0;
    this.elapsedMs = 0;
    this.loop();
  }

  ensureRunning(): void {
    // Public method to ensure scheduler is running (called when entities are created)
    if (!this.isRunning && this.activeEntityCount > 0) {
      this.start();
    }
  }

  stop(): void {
    this.isRunning = false;
    this.keepAliveUntil = 0;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
  }

  private wakeForGPUResults = (): void => {
    if (!this.services) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.keepAliveUntil = Math.max(this.keepAliveUntil, now + GPU_TAIL_KEEP_ALIVE_MS);
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = typeof performance !== 'undefined' ? performance.now() : now;
      this.loop();
    }
  };

  private loop = (): void => {
    if (!this.isRunning) return;
    if (!this.services) {
      this.isRunning = false;
      return;
    }

    const time = performance.now();
    const dt = time - this.lastTime;

    // FPS limiting: check if enough time has passed
    const frameDuration =
      this.services?.config.frameDuration ?? this.getWorld()?.config.frameDuration;

    if (frameDuration && dt < frameDuration) {
      this.frameId = requestAnimationFrame(this.loop);
      return; // Skip frame if not enough time has passed
    }

    this.lastTime = time;
    const frameStart = performance.now();

    // Safety cap for dt to prevent spiraling on lag spikes (e.g., tab background)
    const safeDt = Math.min(dt, SCHEDULER_LIMITS.MAX_FRAME_TIME_MS);
    this.engineFrame++;
    this.elapsedMs += safeDt;
    const config: MotionAppConfig = this.services?.config ?? this.getWorld()?.config ?? {};
    const sampling = this.frameSampler.compute(this.elapsedMs, config);
    const samplingRate =
      typeof config.metricsSamplingRate === 'number' ? config.metricsSamplingRate : 1;

    const ctx: SystemContext | undefined = this.services
      ? {
          services: this.services,
          dt: safeDt,
          sampling: {
            engineFrame: this.engineFrame,
            timeMs: this.elapsedMs,
            fps: sampling.fps,
            framePosition: sampling.framePosition,
            frame: sampling.frame,
            deltaFrame: sampling.deltaFrame,
            deltaTimeMs: sampling.deltaTimeMs,
          },
        }
      : undefined;

    for (const system of this.systems) {
      const systemStart = performance.now();
      try {
        system.update(safeDt, ctx);
      } catch (e) {
        const error = new MotionError(
          `System '${system.name}' update failed`,
          ErrorCode.SYSTEM_UPDATE_FAILED,
          ErrorSeverity.WARNING,
          {
            systemName: system.name,
            originalError: e instanceof Error ? e.message : String(e),
            dt: safeDt,
          },
        );
        (this.services?.errorHandler ?? getErrorHandler()).handle(error);
      } finally {
        const systemDuration = performance.now() - systemStart;
        this.metricsCounter++;
        const shouldSample =
          samplingRate <= 1 || this.metricsCounter % Math.max(1, Math.floor(samplingRate)) === 0;
        if (shouldSample) {
          this.services?.metrics.recordSystemTiming?.(system.name, systemDuration);
        }
      }
    }

    const frameDurationMs = performance.now() - frameStart;
    try {
      this.services.metrics.updateStatus({ frameTimeMs: frameDurationMs });
    } catch {}

    try {
      const shouldSampleMemory =
        samplingRate <= 1 || this.metricsCounter % Math.max(1, Math.floor(samplingRate)) === 0;
      if (shouldSampleMemory) {
        const recordMemorySnapshot = this.services?.metrics.recordMemorySnapshot;
        if (recordMemorySnapshot) {
          let managerStats: {
            bytesSkipped: number;
            totalBytesProcessed: number;
            currentMemoryUsage: number;
            peakMemoryUsage: number;
          } | null = null;
          try {
            const manager = getPersistentGPUBufferManager();
            const stats = manager.getStats();
            managerStats = {
              bytesSkipped: stats.bytesSkipped ?? 0,
              totalBytesProcessed: stats.totalBytesProcessed ?? 0,
              currentMemoryUsage: stats.currentMemoryUsage ?? stats.totalMemoryBytes ?? 0,
              peakMemoryUsage: stats.peakMemoryUsage ?? stats.totalMemoryBytes ?? 0,
            };
          } catch {
            managerStats = null;
          }
          if (managerStats) {
            const timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
            recordMemorySnapshot({
              bytesSkipped: managerStats.bytesSkipped,
              totalBytesProcessed: managerStats.totalBytesProcessed,
              currentMemoryUsage: managerStats.currentMemoryUsage,
              peakMemoryUsage: managerStats.peakMemoryUsage,
              timestamp,
            });
          }
        }
      }
    } catch {}

    const now = performance.now();
    const hasPendingGPUWork = getPendingReadbackCount() > 0 || getGPUResultQueueLength() > 0;
    const shouldContinue =
      this.activeEntityCount > 0 || hasPendingGPUWork || now < this.keepAliveUntil;

    if (!shouldContinue) {
      this.isRunning = false;
      return;
    }

    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : undefined;
    if (!raf) {
      this.isRunning = false;
      return;
    }

    this.frameId = raf(this.loop);
  };
}
