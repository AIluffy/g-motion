/**
 * Output Format Buffer Pool
 *
 * Async buffer pool for managing GPU output buffers with reuse and tracking.
 */

import type { OutputFormatPoolStats, PooledBufferMeta } from './types';
import { nextPow2 } from './types';
import { createDebugger } from '@g-motion/shared';

const warn = createDebugger('OutputFormatBufferPool', 'warn');

const trackedBuffers: GPUBuffer[] = [];

export function trackBuffer(buffer: GPUBuffer): void {
  trackedBuffers.push(buffer);
}

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  async lock(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = this.chain.then(() => next);
    await prev;
    return release;
  }
}

export class OutputFormatBufferPool {
  private readonly mutex = new AsyncMutex();
  private availableByDevice = new WeakMap<GPUDevice, Map<number, GPUBuffer[]>>();
  private activeByDevice = new WeakMap<GPUDevice, Set<GPUBuffer>>();
  private metaByBuffer = new WeakMap<GPUBuffer, PooledBufferMeta>();
  private statsByDevice = new WeakMap<GPUDevice, OutputFormatPoolStats>();

  private getStats(device: GPUDevice): OutputFormatPoolStats {
    let s = this.statsByDevice.get(device);
    if (!s) {
      s = {
        acquireCount: 0,
        reuseCount: 0,
        createCount: 0,
        releaseCount: 0,
        pendingReleaseCount: 0,
        availableBufferCount: 0,
        activeBufferCount: 0,
        bytesRequestedTotal: 0,
        bytesProvidedTotal: 0,
        bytesAllocatedCurrent: 0,
        bytesAllocatedPeak: 0,
        acquireTimeMsTotal: 0,
        lastAcquireMs: 0,
        averageAcquireMs: 0,
        createTimeMsTotal: 0,
        lastCreateMs: 0,
        averageCreateMs: 0,
        reuseTimeMsTotal: 0,
        lastReuseMs: 0,
        averageReuseMs: 0,
        estimatedFragmentationRatio: 0,
      };
      this.statsByDevice.set(device, s);
    }
    return s;
  }

  private getAvailable(device: GPUDevice): Map<number, GPUBuffer[]> {
    let m = this.availableByDevice.get(device);
    if (!m) {
      m = new Map();
      this.availableByDevice.set(device, m);
    }
    return m;
  }

  private getActive(device: GPUDevice): Set<GPUBuffer> {
    let s = this.activeByDevice.get(device);
    if (!s) {
      s = new Set();
      this.activeByDevice.set(device, s);
    }
    return s;
  }

  async acquire(
    device: GPUDevice,
    requestedByteSize: number,
    usage: number,
    label: string,
  ): Promise<GPUBuffer> {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const unlock = await this.mutex.lock();
    let out: GPUBuffer | null = null;
    let didCreate = false;
    let didReuse = false;
    try {
      const stats = this.getStats(device);
      stats.acquireCount += 1;
      stats.bytesRequestedTotal += Math.max(0, requestedByteSize);

      const bucketSize = nextPow2(Math.max(4, requestedByteSize));
      stats.bytesProvidedTotal += bucketSize;

      const available = this.getAvailable(device);
      const list = available.get(bucketSize);
      if (list && list.length) {
        out = list.pop()!;
        stats.reuseCount += 1;
        didReuse = true;
        stats.availableBufferCount = Math.max(0, stats.availableBufferCount - 1);
      } else {
        out = device.createBuffer({
          size: bucketSize,
          usage: usage as number,
          mappedAtCreation: false,
          label,
        });
        this.metaByBuffer.set(out, { device, bucketSize, usage });
        trackBuffer(out);
        stats.createCount += 1;
        didCreate = true;
        stats.bytesAllocatedCurrent += bucketSize;
        stats.bytesAllocatedPeak = Math.max(stats.bytesAllocatedPeak, stats.bytesAllocatedCurrent);
      }

      this.getActive(device).add(out);
      return out;
    } finally {
      unlock();
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const stats = this.getStats(device);
      const dt = Math.max(0, t1 - t0);
      stats.lastAcquireMs = dt;
      stats.acquireTimeMsTotal += dt;
      stats.averageAcquireMs = stats.acquireTimeMsTotal / Math.max(1, stats.acquireCount);
      if (didCreate) {
        stats.lastCreateMs = dt;
        stats.createTimeMsTotal += dt;
        stats.averageCreateMs = stats.createTimeMsTotal / Math.max(1, stats.createCount);
      } else if (didReuse) {
        stats.lastReuseMs = dt;
        stats.reuseTimeMsTotal += dt;
        stats.averageReuseMs = stats.reuseTimeMsTotal / Math.max(1, stats.reuseCount);
      }
      stats.estimatedFragmentationRatio =
        stats.bytesProvidedTotal > 0
          ? Math.max(
              0,
              (stats.bytesProvidedTotal - stats.bytesRequestedTotal) / stats.bytesProvidedTotal,
            )
          : 0;
      stats.activeBufferCount = this.getActive(device).size;
    }
  }

  async release(buffer: GPUBuffer, queue: GPUQueue): Promise<void> {
    const meta = this.metaByBuffer.get(buffer);
    if (!meta) {
      try {
        buffer.destroy();
      } catch {}
      return;
    }

    const device = meta.device;
    const unlock = await this.mutex.lock();
    const stats = this.getStats(device);
    try {
      stats.releaseCount += 1;
      const active = this.getActive(device);
      active.delete(buffer);
      stats.activeBufferCount = active.size;
      stats.pendingReleaseCount += 1;
    } finally {
      unlock();
    }

    let done: Promise<void>;
    try {
      done = queue.onSubmittedWorkDone() as any;
    } catch {
      done = Promise.resolve();
    }

    done
      .catch((error) => {
        warn('queue.onSubmittedWorkDone failed', error);
      })
      .then(async () => {
        const unlock2 = await this.mutex.lock();
        try {
          const available = this.getAvailable(device);
          let list = available.get(meta.bucketSize);
          if (!list) {
            list = [];
            available.set(meta.bucketSize, list);
          }
          list.push(buffer);
          const s = this.getStats(device);
          s.availableBufferCount += 1;
          s.pendingReleaseCount = Math.max(0, s.pendingReleaseCount - 1);
        } finally {
          unlock2();
        }
      });
  }

  getStatsForTests(device: GPUDevice): OutputFormatPoolStats {
    return { ...this.getStats(device) };
  }

  resetForTests(): void {
    this.availableByDevice = new WeakMap();
    this.activeByDevice = new WeakMap();
    this.metaByBuffer = new WeakMap();
    this.statsByDevice = new WeakMap();
  }
}

export const outputFormatBufferPool = new OutputFormatBufferPool();
