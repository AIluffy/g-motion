import { World } from '@g-motion/core';

/**
 * Global engine configuration object for controlling animation behavior
 */
class EngineConfig {
  private world?: World;

  /**
   * Get or initialize the World instance
   */
  private getWorld(): World {
    if (!this.world) {
      this.world = World.get();
    }
    return this.world;
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
   *   - 'auto': Use GPU when entity count exceeds threshold (default)
   *   - 'always': Always use GPU regardless of entity count
   *   - 'never': Never use GPU, always use CPU
   * @example
   * engine.forceGpu('always'); // Always use GPU
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
    return world.config.gpuCompute ?? 'auto';
  }

  /**
   * Set GPU activation threshold (only affects 'auto' mode)
   * @param threshold - Number of entities before GPU activation (default: 1000)
   * @example
   * engine.setGpuThreshold(500); // Activate GPU at 500+ entities
   */
  setGpuThreshold(threshold: number): void {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error(
        `[Motion Engine] GPU threshold must be a non-negative number, got: ${threshold}`,
      );
    }

    const world = this.getWorld();
    world.config.webgpuThreshold = threshold;
  }

  /**
   * Get GPU activation threshold
   * @returns Current threshold value
   */
  getGpuThreshold(): number {
    const world = this.getWorld();
    return world.config.webgpuThreshold ?? 1000;
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
  }

  /**
   * Get current engine configuration
   * @returns Current configuration object
   */
  getConfig(): {
    speed: number;
    fps: number;
    gpuMode: 'auto' | 'always' | 'never';
    gpuThreshold: number;
    gpuEasing: boolean;
  } {
    return {
      speed: this.getSpeed(),
      fps: this.getFps(),
      gpuMode: this.getGpuMode(),
      gpuThreshold: this.getGpuThreshold(),
      gpuEasing: this.getGpuEasing(),
    };
  }

  /**
   * Reset all engine settings to defaults
   */
  reset(): void {
    this.configure({
      speed: 1,
      fps: 60,
      gpuMode: 'auto',
      gpuThreshold: 1000,
      gpuEasing: true,
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
