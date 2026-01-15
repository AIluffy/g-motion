import type { EngineServices, MotionAppConfig, SystemContext, SystemDef } from './plugin';
import { createDebugger } from '@g-motion/utils';
import { FrameSampler, getNowMs } from './utils';
import { getErrorHandler } from './context';
import { ErrorCode, ErrorSeverity, MotionError } from './errors';
import { getPersistentGPUBufferManager } from './webgpu/persistent-buffer-manager';

const warn = createDebugger('SchedulerProcessor', 'warn');

export class SchedulerProcessor {
  private engineFrame = 0;
  private elapsedMs = 0;
  private metricsCounter = 0;
  private readonly frameSampler = new FrameSampler();
  private metricsUpdateFailedLogged = false;
  private persistentBufferStatsFailedLogged = false;
  private memorySnapshotFailedLogged = false;

  resetClock(): void {
    this.engineFrame = 0;
    this.elapsedMs = 0;
  }

  processFrame(params: {
    dtMs: number;
    services: EngineServices;
    systems: SystemDef[];
    getWorld: () => { config: MotionAppConfig } | null;
  }): void {
    const { dtMs, services, systems, getWorld } = params;

    this.engineFrame++;
    this.elapsedMs += dtMs;

    const config: MotionAppConfig = services.config ?? getWorld()?.config ?? {};
    const sampling = this.frameSampler.compute(this.elapsedMs, config);
    const samplingRate =
      typeof config.metricsSamplingRate === 'number' ? config.metricsSamplingRate : 1;

    const nowMs = getNowMs();
    const ctx: SystemContext = {
      services,
      dt: dtMs,
      nowMs,
      sampling: {
        engineFrame: this.engineFrame,
        timeMs: this.elapsedMs,
        fps: sampling.fps,
        framePosition: sampling.framePosition,
        frame: sampling.frame,
        deltaFrame: sampling.deltaFrame,
        deltaTimeMs: sampling.deltaTimeMs,
      },
    };

    const frameStart = performance.now();
    for (const system of systems) {
      const systemStart = performance.now();
      try {
        system.update(dtMs, ctx);
      } catch (e) {
        const error = new MotionError(
          `System '${system.name}' update failed`,
          ErrorCode.SYSTEM_UPDATE_FAILED,
          ErrorSeverity.WARNING,
          {
            systemName: system.name,
            originalError: e instanceof Error ? e.message : String(e),
            dt: dtMs,
          },
        );
        (services.errorHandler ?? getErrorHandler()).handle(error);
      } finally {
        const systemDuration = performance.now() - systemStart;
        this.metricsCounter++;
        const shouldSample =
          samplingRate <= 1 || this.metricsCounter % Math.max(1, Math.floor(samplingRate)) === 0;
        if (shouldSample) {
          services.metrics.recordSystemTiming?.(system.name, systemDuration);
        }
      }
    }

    const frameDurationMs = performance.now() - frameStart;
    const updateStatus = services.metrics.updateStatus;
    if (updateStatus) {
      try {
        updateStatus.call(services.metrics, { frameTimeMs: frameDurationMs });
      } catch (e) {
        if (!this.metricsUpdateFailedLogged) {
          this.metricsUpdateFailedLogged = true;
          warn('metrics.updateStatus failed', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    this.maybeRecordMemorySnapshot(services, samplingRate);
  }

  private maybeRecordMemorySnapshot(services: EngineServices, samplingRate: number): void {
    const shouldSampleMemory =
      samplingRate <= 1 || this.metricsCounter % Math.max(1, Math.floor(samplingRate)) === 0;
    if (!shouldSampleMemory) return;
    const recordMemorySnapshot = services.metrics.recordMemorySnapshot;
    if (!recordMemorySnapshot) return;

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
    } catch (e) {
      if (!this.persistentBufferStatsFailedLogged) {
        this.persistentBufferStatsFailedLogged = true;
        warn('getPersistentGPUBufferManager().getStats failed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }

    if (!managerStats) return;
    const timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      recordMemorySnapshot({
        bytesSkipped: managerStats.bytesSkipped,
        totalBytesProcessed: managerStats.totalBytesProcessed,
        currentMemoryUsage: managerStats.currentMemoryUsage,
        peakMemoryUsage: managerStats.peakMemoryUsage,
        timestamp,
      });
    } catch (e) {
      if (!this.memorySnapshotFailedLogged) {
        this.memorySnapshotFailedLogged = true;
        warn('metrics.recordMemorySnapshot failed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
