import { nextPow2 } from '../output-format/types';

export type OutputBufferReadbackTag = {
  kind: 'output-buffer';
  archetypeId: string;
  buffer: GPUBuffer;
};

type OutputBufferPoolStats = {
  acquireCount: number;
  reuseCount: number;
  createCount: number;
  releaseCount: number;
  destroyOnReleaseCount: number;
  availableBufferCount: number;
  activeBufferCount: number;
};

type OutputBufferPoolBufferMeta = {
  device: GPUDevice;
  bucketSize: number;
  usage: number;
  key: string;
};

class OutputBufferPool {
  private availableByDevice = new WeakMap<GPUDevice, Map<string, GPUBuffer[]>>();
  private activeByDevice = new WeakMap<GPUDevice, Set<GPUBuffer>>();
  private metaByBuffer = new WeakMap<GPUBuffer, OutputBufferPoolBufferMeta>();
  private statsByDevice = new WeakMap<GPUDevice, OutputBufferPoolStats>();
  private maxAvailablePerKey = 3;

  acquire(
    device: GPUDevice,
    archetypeId: string,
    requestedByteSize: number,
    usage: number,
    label: string,
  ): { buffer: GPUBuffer; tag: OutputBufferReadbackTag } {
    const stats = this.getStats(device);
    stats.acquireCount += 1;
    const bucketSize = nextPow2(Math.max(4, requestedByteSize));
    const key = `${archetypeId}:${bucketSize}:${usage}`;
    const available = this.getAvailable(device);
    const list = available.get(key);
    let buffer: GPUBuffer;
    if (list && list.length) {
      buffer = list.pop()!;
      stats.reuseCount += 1;
      stats.availableBufferCount = Math.max(0, stats.availableBufferCount - 1);
    } else {
      buffer = device.createBuffer({
        size: bucketSize,
        usage: usage as number,
        mappedAtCreation: false,
        label,
      });
      this.metaByBuffer.set(buffer, { device, bucketSize, usage, key });
      stats.createCount += 1;
    }
    this.getActive(device).add(buffer);
    stats.activeBufferCount = this.getActive(device).size;
    return { buffer, tag: { kind: 'output-buffer', archetypeId, buffer } };
  }

  release(buffer: GPUBuffer): void {
    const meta = this.metaByBuffer.get(buffer);
    if (!meta) {
      try {
        buffer.destroy();
      } catch {}
      return;
    }

    const device = meta.device;
    const stats = this.getStats(device);
    stats.releaseCount += 1;

    const active = this.getActive(device);
    active.delete(buffer);
    stats.activeBufferCount = active.size;

    const available = this.getAvailable(device);
    let list = available.get(meta.key);
    if (!list) {
      list = [];
      available.set(meta.key, list);
    }

    if (list.length >= this.maxAvailablePerKey) {
      stats.destroyOnReleaseCount += 1;
      try {
        buffer.destroy();
      } catch {}
      return;
    }

    list.push(buffer);
    stats.availableBufferCount += 1;
  }

  getStatsForTests(device: GPUDevice): OutputBufferPoolStats {
    return { ...this.getStats(device) };
  }

  resetForTests(): void {
    this.availableByDevice = new WeakMap();
    this.activeByDevice = new WeakMap();
    this.metaByBuffer = new WeakMap();
    this.statsByDevice = new WeakMap();
  }

  private getAvailable(device: GPUDevice): Map<string, GPUBuffer[]> {
    let map = this.availableByDevice.get(device);
    if (!map) {
      map = new Map();
      this.availableByDevice.set(device, map);
    }
    return map;
  }

  private getActive(device: GPUDevice): Set<GPUBuffer> {
    let set = this.activeByDevice.get(device);
    if (!set) {
      set = new Set();
      this.activeByDevice.set(device, set);
    }
    return set;
  }

  private getStats(device: GPUDevice): OutputBufferPoolStats {
    let stats = this.statsByDevice.get(device);
    if (!stats) {
      stats = {
        acquireCount: 0,
        reuseCount: 0,
        createCount: 0,
        releaseCount: 0,
        destroyOnReleaseCount: 0,
        availableBufferCount: 0,
        activeBufferCount: 0,
      };
      this.statsByDevice.set(device, stats);
    }
    return stats;
  }
}

const outputBufferPool = new OutputBufferPool();

export function acquirePooledOutputBuffer(params: {
  device: GPUDevice;
  archetypeId: string;
  requestedByteSize: number;
  usage: number;
  label: string;
}): { buffer: GPUBuffer; tag: OutputBufferReadbackTag } {
  return outputBufferPool.acquire(
    params.device,
    params.archetypeId,
    params.requestedByteSize,
    params.usage,
    params.label,
  );
}

export function releasePooledOutputBuffer(buffer: GPUBuffer): void {
  outputBufferPool.release(buffer);
}

export function tryReleasePooledOutputBufferFromTag(tag: unknown): boolean {
  if (!tag || typeof tag !== 'object') return false;
  const obj = tag as { kind?: unknown; buffer?: unknown };
  if (obj.kind !== 'output-buffer') return false;
  const buffer = obj.buffer as GPUBuffer | undefined;
  if (!buffer) return false;
  releasePooledOutputBuffer(buffer);
  return true;
}

export function __getOutputBufferPoolStatsForTests(device: GPUDevice): OutputBufferPoolStats {
  return outputBufferPool.getStatsForTests(device);
}

export function __resetOutputBufferPoolForTests(): void {
  outputBufferPool.resetForTests();
}
