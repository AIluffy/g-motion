import { SystemDef } from './plugin';
import { WorldProvider } from './worldProvider';
import { SCHEDULER_LIMITS } from './constants';

export class SystemScheduler {
  private systems: SystemDef[] = [];
  private isRunning = false;
  private lastTime = 0;
  private frameId = 0;
  private activeEntityCount = 0;

  private getWorld() {
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
      this.stop();
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
    this.isRunning = true;
    this.lastTime = performance.now();
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
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    const time = performance.now();
    const dt = time - this.lastTime;

    // FPS limiting: check if enough time has passed
    const frameDuration = (this.getWorld()?.config as any)?.frameDuration;
    if (frameDuration && dt < frameDuration) {
      this.frameId = requestAnimationFrame(this.loop);
      return; // Skip frame if not enough time has passed
    }

    this.lastTime = time;

    // Safety cap for dt to prevent spiraling on lag spikes (e.g., tab background)
    const safeDt = Math.min(dt, SCHEDULER_LIMITS.MAX_FRAME_TIME_MS);

    for (const system of this.systems) {
      try {
        // Systems iterate archetypes directly via World.getArchetypes()
        // This is more efficient than a separate query system for our archetype-based ECS
        system.update(safeDt);
      } catch (e) {
        console.error(`[Motion] System '${system.name}' error:`, e);
      }
    }

    this.frameId = requestAnimationFrame(this.loop);
  };
}
