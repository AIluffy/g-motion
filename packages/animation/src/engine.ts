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
      throw new Error(`[Motion Engine] Speed must be a positive number, got: ${speed}`);
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

  /**
   * Force GPU acceleration mode
   * @param mode - GPU compute mode: 'auto' | 'always' | 'never'
   *   - 'auto': Same as 'always' (GPU-first with automatic CPU fallback)
   *   - 'always': Always attempt GPU compute, fall back to CPU if unavailable (default)
   *   - 'never': Never use GPU, always use CPU
   * @example
   * engine.forceGpu('always'); // Always use GPU (default)
   * engine.forceGpu('never');  // Disable GPU, use CPU only
   */
  forceGpu(mode: 'auto' | 'always' | 'never'): void {
    if (!['auto', 'always', 'never'].includes(mode)) {
      throw new Error(
        `[Motion Engine] Invalid GPU mode: ${mode}. Must be 'auto', 'always', or 'never'.`,
      );
    }

    const world = this.getWorld();
    world.config.gpuCompute = mode;
  }

  /**
   * Get current GPU mode
   * @returns GPU compute mode ('auto' | 'always' | 'never')
   */
  getGpuMode(): 'auto' | 'always' | 'never' {
    const world = this.getWorld();
    return world.config.gpuCompute ?? 'always';
  }

  /**
   * @deprecated GPU threshold is no longer used. GPU is enabled by default.
   * Use forceGpu('never') to disable GPU acceleration.
   */
  setGpuThreshold(threshold: number): void {
    console.warn(
      '[Motion Engine] setGpuThreshold is deprecated. GPU is now enabled by default. ' +
        "Use forceGpu('never') to disable GPU acceleration.",
    );
    // Keep for backward compatibility but no-op
    const world = this.getWorld();
    world.config.webgpuThreshold = threshold;
  }

  /**
   * @deprecated GPU threshold is no longer used.
   */
  getGpuThreshold(): number {
    const world = this.getWorld();
    return world.config.webgpuThreshold ?? 0;
  }

  /**
   * Enable or disable GPU-accelerated easing functions
   * @param enabled - Whether to use GPU for easing calculations
   * @example
   * engine.setGpuEasing(false); // Use CPU for easing
   */
  setGpuEasing(enabled: boolean): void {
    const world = this.getWorld();
    world.config.gpuEasing = enabled;
  }

  /**
   * Check if GPU easing is enabled
   * @returns True if GPU easing is enabled
   */
  getGpuEasing(): boolean {
    const world = this.getWorld();
    return world.config.gpuEasing ?? true;
  }

  setMetricsSamplingRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`[Motion Engine] metricsSamplingRate must be positive, got: ${rate}`);
    }
    const world = this.getWorld();
    (world.config as any).metricsSamplingRate = Math.floor(rate);
  }

  getMetricsSamplingRate(): number {
    const world = this.getWorld();
    return Number((world.config as any).metricsSamplingRate ?? 1);
  }

  setWorkSlicing(options: {
    enabled?: boolean;
    interpolationArchetypesPerFrame?: number;
    batchSamplingArchetypesPerFrame?: number;
  }): void {
    const world = this.getWorld();
    const current = (world.config as any).workSlicing || {};
    (world.config as any).workSlicing = {
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
    return ((world.config as any).workSlicing || {}) as any;
  }

  /**
   * Configure multiple engine settings at once
   * @param config - Configuration object
   * @example
   * engine.configure({
   *   speed: 2,
   *   fps: 30,
   *   gpuMode: 'always',
   *   gpuThreshold: 500,
   *   gpuEasing: true
   * });
   */
  configure(config: {
    speed?: number;
    fps?: number;
    gpuMode?: 'auto' | 'always' | 'never';
    gpuThreshold?: number;
    gpuEasing?: boolean;
    metricsSamplingRate?: number;
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
    if (config.gpuMode !== undefined) {
      this.forceGpu(config.gpuMode);
    }
    if (config.gpuThreshold !== undefined) {
      this.setGpuThreshold(config.gpuThreshold);
    }
    if (config.gpuEasing !== undefined) {
      this.setGpuEasing(config.gpuEasing);
    }
    if (config.metricsSamplingRate !== undefined) {
      this.setMetricsSamplingRate(config.metricsSamplingRate);
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
    gpuMode: 'auto' | 'always' | 'never';
    gpuEasing: boolean;
    metricsSamplingRate: number;
    workSlicing: {
      enabled?: boolean;
      interpolationArchetypesPerFrame?: number;
      batchSamplingArchetypesPerFrame?: number;
    };
  } {
    return {
      speed: this.getSpeed(),
      fps: this.getFps(),
      gpuMode: this.getGpuMode(),
      gpuEasing: this.getGpuEasing(),
      metricsSamplingRate: this.getMetricsSamplingRate(),
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
      gpuMode: 'always', // GPU-first by default
      gpuEasing: true,
      metricsSamplingRate: 1,
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
 * // Force GPU mode
 * engine.forceGpu('always'); // Always use GPU
 *
 * // Configure multiple settings
 * engine.configure({
 *   speed: 1.5,
 *   fps: 60,
 *   gpuMode: 'auto',
 *   gpuThreshold: 500
 * });
 */
export const engine = new EngineConfig();
