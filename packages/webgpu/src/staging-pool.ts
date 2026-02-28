/**
 * Staging Buffer Pool
 * Manages persistent staging buffers per archetype to avoid alloc/dealloc pressure.
 * Supports growth but reuses buffers across frames.
 */

export interface StagingBufferEntry {
  buffer: GPUBuffer;
  size: number;
  lastUsedFrame: number;
  isInFlight: boolean; // true if mapAsync pending
}

export class StagingBufferPool {
  private pools = new Map<string, StagingBufferEntry[]>();
  private entryByBuffer = new WeakMap<GPUBuffer, StagingBufferEntry>();
  private device: GPUDevice;
  private currentFrame = 0;
  private readonly initialSize = 1024; // 4KB default
  private readonly maxPoolPerArchetype = 8;
  private readonly frameThreshold = 5; // reclaim if unused for N frames

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Get or create a staging buffer for readback
   */
  acquire(archetypeId: string, requiredSize: number): GPUBuffer | null {
    if (!this.pools.has(archetypeId)) {
      this.pools.set(archetypeId, []);
    }

    const pool = this.pools.get(archetypeId)!;

    // Find a free buffer with sufficient size
    for (const entry of pool) {
      if (!entry.isInFlight && entry.size >= requiredSize) {
        entry.lastUsedFrame = this.currentFrame;
        this.entryByBuffer.set(entry.buffer, entry);
        return entry.buffer;
      }
    }

    // Create new buffer if pool below max
    if (pool.length < this.maxPoolPerArchetype) {
      const size = Math.max(requiredSize, this.initialSize);
      const buffer = this.device.createBuffer({
        size,
        usage: (GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ) as number,
        mappedAtCreation: false,
        label: `staging-${archetypeId}-${pool.length}`,
      });

      const entry: StagingBufferEntry = {
        buffer,
        size,
        lastUsedFrame: this.currentFrame,
        isInFlight: false,
      };
      pool.push(entry);
      this.entryByBuffer.set(buffer, entry);
      return buffer;
    }

    return null;
  }

  /**
   * Mark buffer as in-flight (waiting for mapAsync)
   */
  markInFlight(buffer: GPUBuffer): void {
    const entry = this.entryByBuffer.get(buffer);
    if (!entry) return;
    entry.isInFlight = true;
  }

  /**
   * Mark buffer as available
   */
  markAvailable(buffer: GPUBuffer): void {
    const entry = this.entryByBuffer.get(buffer);
    if (!entry) return;
    entry.isInFlight = false;
  }

  /**
   * Increment frame counter and reclaim old buffers
   */
  nextFrame(): void {
    this.currentFrame++;

    // Reclaim buffers unused for frameThreshold frames
    for (const [archetypeId, pool] of this.pools.entries()) {
      const toKeep: StagingBufferEntry[] = [];
      for (const entry of pool) {
        if (this.currentFrame - entry.lastUsedFrame < this.frameThreshold && !entry.isInFlight) {
          toKeep.push(entry);
        } else if (!entry.isInFlight) {
          entry.buffer.destroy();
        } else {
          // Keep in-flight buffers for now
          toKeep.push(entry);
        }
      }
      if (toKeep.length === 0) {
        this.pools.delete(archetypeId);
      } else {
        this.pools.set(archetypeId, toKeep);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    archetypeCount: number;
    totalBuffers: number;
    avgBuffersPerArchetype: number;
    inFlightCount: number;
  } {
    let totalBuffers = 0;
    let inFlightCount = 0;
    for (const pool of this.pools.values()) {
      totalBuffers += pool.length;
      inFlightCount += pool.filter((e) => e.isInFlight).length;
    }
    return {
      archetypeCount: this.pools.size,
      totalBuffers,
      avgBuffersPerArchetype: this.pools.size > 0 ? totalBuffers / this.pools.size : 0,
      inFlightCount,
    };
  }

  /**
   * Clear all buffers (cleanup)
   */
  clear(): void {
    for (const pool of this.pools.values()) {
      for (const entry of pool) {
        if (!entry.isInFlight) {
          entry.buffer.destroy();
        }
      }
    }
    this.pools.clear();
    this.currentFrame = 0;
  }
}
