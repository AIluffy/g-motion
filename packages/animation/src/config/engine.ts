import { panic } from '@g-motion/shared';
import { WorldProvider } from '@g-motion/core';

/**
 * Global engine configuration object for controlling animation behavior
 */
class EngineConfig {
  private getWorld() {
    return WorldProvider.useWorld();
  }

  /**
   * Set global animation speed multiplier (playback rate)
   * @param speed - Speed multiplier (1 = normal, 2 = double speed, 0.5 = half speed)
   * @example
   * engine.setSpeed(2); // Double speed for all animations
   */
  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) {
      panic(`[Motion Engine] Speed must be a positive number, got: ${speed}`, { speed });
    }
    this.getWorld().config.globalSpeed = speed;
  }

  getSpeed(): number {
    return this.getWorld().config.globalSpeed ?? 1;
  }

  /**
   * Set target FPS (frames per second) for the animation scheduler
   * Note: This controls the maximum frame rate, actual FPS may vary based on browser performance
   * @param fps - Target frames per second (e.g., 30, 60, 120)
   * @example
   * engine.setFps(30); // Cap at 30 FPS for lower power consumption
   */
  setFps(fps: number): void {
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new Error(`[Motion Engine] FPS must be a positive number, got: ${fps}`);
    }
    const config = this.getWorld().config;
    config.targetFps = fps;
    config.frameDuration = 1000 / fps;
  }

  getFps(): number {
    return this.getWorld().config.targetFps ?? 60;
  }

  setSamplingMode(mode: 'time' | 'frame'): void {
    if (!['time', 'frame'].includes(mode)) {
      throw new Error(`[Motion Engine] Invalid sampling mode: ${mode}`);
    }
    const world = this.getWorld();
    world.config.samplingMode = mode;
  }

  getSamplingMode(): 'time' | 'frame' {
    const world = this.getWorld();
    return world.config.samplingMode;
  }

  setSamplingFps(fps: number): void {
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new Error(`[Motion Engine] samplingFps must be a positive number, got: ${fps}`);
    }
    const world = this.getWorld();
    world.config.samplingFps = fps;
    world.config.samplingMode = world.config.samplingMode ?? 'frame';
  }

  getSamplingFps(): number {
    const world = this.getWorld();
    const config = world.config;
    return Number(config.samplingFps ?? config.targetFps ?? 60);
  }

  setMetricsSamplingRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`[Motion Engine] metricsSamplingRate must be positive, got: ${rate}`);
    }
    const world = this.getWorld();
    world.config.metricsSamplingRate = Math.floor(rate);
  }

  getMetricsSamplingRate(): number {
    const world = this.getWorld();
    return Number(world.config.metricsSamplingRate ?? 1);
  }

  setWorkSlicing(options: {
    enabled?: boolean;
    interpolationArchetypesPerFrame?: number;
    batchSamplingArchetypesPerFrame?: number;
  }): void {
    const world = this.getWorld();
    const current = world.config.workSlicing || {};
    world.config.workSlicing = {
      ...current,
      ...options,
    };
  }

  getWorkSlicing(): {
    enabled?: boolean;
    interpolationArchetypesPerFrame?: number;
    batchSamplingArchetypesPerFrame?: number;
  } {
    const world = this.getWorld();
    return world.config.workSlicing || {};
  }

  /**
   * Configure multiple engine settings at once
   * @param config - Configuration object
   * @example
   * engine.configure({
   *   speed: 2,
   *   fps: 30,
   * });
   */
  configure(config: {
    speed?: number;
    fps?: number;
    metricsSamplingRate?: number;
    sampling?: { mode?: 'time' | 'frame'; fps?: number };
    workSlicing?: {
      enabled?: boolean;
      interpolationArchetypesPerFrame?: number;
      batchSamplingArchetypesPerFrame?: number;
    };
  }): void {
    if (config.speed !== undefined) {
      this.setSpeed(config.speed);
    }
    if (config.fps !== undefined) {
      this.setFps(config.fps);
    }
    if (config.metricsSamplingRate !== undefined) {
      this.setMetricsSamplingRate(config.metricsSamplingRate);
    }
    if (config.sampling?.mode !== undefined) {
      this.setSamplingMode(config.sampling.mode);
    }
    if (config.sampling?.fps !== undefined) {
      this.setSamplingFps(config.sampling.fps);
    }
    if (config.workSlicing !== undefined) {
      this.setWorkSlicing(config.workSlicing);
    }
  }

  /**
   * Get current engine configuration
   * @returns Current configuration object
   */
  getConfig(): {
    speed: number;
    fps: number;
    metricsSamplingRate: number;
    sampling: { mode: 'time' | 'frame'; fps: number };
    workSlicing: {
      enabled?: boolean;
      interpolationArchetypesPerFrame?: number;
      batchSamplingArchetypesPerFrame?: number;
    };
  } {
    return {
      speed: this.getSpeed(),
      fps: this.getFps(),
      metricsSamplingRate: this.getMetricsSamplingRate(),
      sampling: { mode: this.getSamplingMode(), fps: this.getSamplingFps() },
      workSlicing: this.getWorkSlicing(),
    };
  }

  /**
   * Reset all engine settings to defaults
   */
  reset(): void {
    this.configure({
      speed: 1,
      fps: 60,
      metricsSamplingRate: 1,
      sampling: { mode: 'time', fps: 60 },
      workSlicing: {
        enabled: false,
        interpolationArchetypesPerFrame: 0,
        batchSamplingArchetypesPerFrame: 0,
      },
    });
  }
}

/**
 * Global engine configuration singleton
 *
 * @example
 * import { engine } from '@g-motion/animation';
 *
 * // Set global animation speed
 * engine.setSpeed(2); // 2x speed
 *
 * // Control FPS
 * engine.setFps(30); // Cap at 30 FPS
 *
 * // Configure multiple settings
 * engine.configure({
 *   speed: 1.5,
 *   fps: 60,
 * });
 */
export const engine = new EngineConfig();
