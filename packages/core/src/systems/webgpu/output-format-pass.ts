import type { ChannelMapping } from '../../webgpu/channel-mapping';
import { isStandardTransformChannels } from '../../webgpu/channel-mapping';
import {
  createStandardChannelMapping,
  OUTPUT_FORMAT,
  OUTPUT_FORMAT_SHADER,
  packOutputChannels,
} from '../../webgpu/output-format-shader';

let outputFormatPipeline: GPUComputePipeline | null = null;
let outputFormatBindGroupLayout: GPUBindGroupLayout | null = null;
let outputFormatPassEnabled = true;

let channelsBufferCache = new WeakMap<GPUDevice, Map<string, GPUBuffer>>();
let paramsBufferCache = new WeakMap<GPUDevice, GPUBuffer>();
const trackedBuffers: GPUBuffer[] = [];

function trackBuffer(buffer: GPUBuffer): void {
  trackedBuffers.push(buffer);
}

export type OutputFormatPoolStats = {
  acquireCount: number;
  reuseCount: number;
  createCount: number;
  releaseCount: number;
  pendingReleaseCount: number;
  availableBufferCount: number;
  activeBufferCount: number;
  bytesRequestedTotal: number;
  bytesProvidedTotal: number;
  bytesAllocatedCurrent: number;
  bytesAllocatedPeak: number;
  acquireTimeMsTotal: number;
  lastAcquireMs: number;
  averageAcquireMs: number;
  createTimeMsTotal: number;
  lastCreateMs: number;
  averageCreateMs: number;
  reuseTimeMsTotal: number;
  lastReuseMs: number;
  averageReuseMs: number;
  estimatedFragmentationRatio: number;
};

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

type PooledBufferMeta = {
  device: GPUDevice;
  bucketSize: number;
  usage: number;
};

function nextPow2(n: number): number {
  let v = Math.max(1, n | 0);
  v--;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  v++;
  return v >>> 0;
}

class OutputFormatBufferPool {
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
      .catch(() => {})
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

const outputFormatBufferPool = new OutputFormatBufferPool();

function makeChannelsKey(
  channels: Array<{ sourceIndex: number; formatType: number; minValue: number; maxValue: number }>,
) {
  let key = '';
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    key += `${c.sourceIndex}|${c.formatType}|${c.minValue}|${c.maxValue};`;
  }
  return key;
}

export function enableGPUOutputFormatPass(): void {
  outputFormatPassEnabled = true;
}

export function disableGPUOutputFormatPass(): void {
  outputFormatPassEnabled = false;
}

export function __resetOutputFormatPassForTests(): void {
  outputFormatPipeline = null;
  outputFormatBindGroupLayout = null;
  outputFormatPassEnabled = true;
  channelsBufferCache = new WeakMap();
  paramsBufferCache = new WeakMap();
  for (const b of trackedBuffers) {
    try {
      b.destroy();
    } catch {}
  }
  trackedBuffers.length = 0;
  outputFormatBufferPool.resetForTests();
}

async function getOutputFormatPipeline(device: GPUDevice): Promise<GPUComputePipeline | null> {
  if (outputFormatPipeline && outputFormatBindGroupLayout) {
    return outputFormatPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: OUTPUT_FORMAT_SHADER,
    label: 'motion-output-format-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-output-format-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'uniform' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-output-format-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-output-format-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'formatOutputs' },
  });

  outputFormatBindGroupLayout = bindGroupLayout;
  outputFormatPipeline = pipeline;
  return pipeline;
}

function getOrCreateChannelsBuffer(
  device: GPUDevice,
  queue: GPUQueue,
  key: string,
  channelsData: ArrayBuffer,
  label: string,
): GPUBuffer {
  let perDevice = channelsBufferCache.get(device);
  if (!perDevice) {
    perDevice = new Map();
    channelsBufferCache.set(device, perDevice);
  }

  const existing = perDevice.get(key);
  if (existing) return existing;

  const buffer = device.createBuffer({
    size: channelsData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label,
  });
  queue.writeBuffer(buffer, 0, channelsData as ArrayBuffer, 0, channelsData.byteLength);
  perDevice.set(key, buffer);
  trackBuffer(buffer);
  return buffer;
}

function getOrCreateParamsBuffer(device: GPUDevice): GPUBuffer {
  const existing = paramsBufferCache.get(device);
  if (existing) return existing;

  const buffer = device.createBuffer({
    size: 16,
    usage: (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-output-format-params',
  });
  paramsBufferCache.set(device, buffer);
  trackBuffer(buffer);
  return buffer;
}

export async function runOutputFormatPass(
  device: GPUDevice,
  queue: GPUQueue,
  archetypeId: string,
  rawOutputBuffer: GPUBuffer,
  usedRawValueCount: number,
  rawStride: number,
  outputChannels: ChannelMapping[] | undefined,
): Promise<GPUBuffer> {
  if (!outputFormatPassEnabled || !usedRawValueCount) {
    return rawOutputBuffer;
  }

  const pipeline = await getOutputFormatPipeline(device);
  if (!pipeline || !outputFormatBindGroupLayout) {
    return rawOutputBuffer;
  }

  const channelCount = outputChannels && outputChannels.length > 0 ? outputChannels.length : 0;
  if (!channelCount) {
    return rawOutputBuffer;
  }

  const safeRawStride = Math.max(1, Math.floor(rawStride) || channelCount);
  const entityCount = Math.max(0, Math.floor(usedRawValueCount / safeRawStride));
  const usedOutputValueCount = entityCount * channelCount;

  const channels: {
    sourceIndex: number;
    formatType: number;
    minValue: number;
    maxValue: number;
  }[] = new Array(channelCount);

  const useStandardMapping = outputChannels && isStandardTransformChannels(outputChannels);

  if (useStandardMapping) {
    const standard = createStandardChannelMapping();
    for (let i = 0; i < channelCount && i < standard.length; i++) {
      const s = standard[i];
      channels[i] = {
        sourceIndex: s.sourceIndex,
        formatType: s.formatType,
        minValue: s.minValue ?? 0,
        maxValue: s.maxValue ?? 1,
      };
    }
  } else if (outputChannels && outputChannels.length > 0) {
    let needsFormat = false;
    for (let i = 0; i < channelCount; i++) {
      const mapping = outputChannels[i];
      const sourceIndex =
        typeof mapping?.sourceIndex === 'number'
          ? mapping.sourceIndex
          : mapping
            ? mapping.index
            : i;
      const formatType =
        typeof mapping?.formatType === 'number' ? mapping.formatType : OUTPUT_FORMAT.FLOAT;
      const hasMin = typeof mapping?.minValue === 'number';
      const hasMax = typeof mapping?.maxValue === 'number';
      let minValue = hasMin ? (mapping!.minValue as number) : undefined;
      let maxValue = hasMax ? (mapping!.maxValue as number) : undefined;

      if (formatType === OUTPUT_FORMAT.FLOAT) {
        if (!hasMin && !hasMax) {
          minValue = 0;
          maxValue = 0;
        } else {
          if (!hasMin) minValue = 0;
          if (!hasMax) maxValue = 0;
        }
      } else {
        if (!hasMin) minValue = 0;
        if (!hasMax) maxValue = 1;
      }
      channels[i] = {
        sourceIndex,
        formatType,
        minValue: minValue ?? 0,
        maxValue: maxValue ?? 1,
      };

      if (!needsFormat) {
        if (safeRawStride !== channelCount) needsFormat = true;
        else if (sourceIndex !== i) needsFormat = true;
        else if (formatType !== OUTPUT_FORMAT.FLOAT) needsFormat = true;
        else if (typeof mapping?.minValue === 'number' && typeof mapping?.maxValue === 'number') {
          if (mapping.minValue < mapping.maxValue) needsFormat = true;
        }
      }
    }
    if (!needsFormat) {
      return rawOutputBuffer;
    }
  } else {
    return rawOutputBuffer;
  }

  const channelsData = packOutputChannels(channels);
  const channelsKey = makeChannelsKey(channels);
  const channelsBuffer = getOrCreateChannelsBuffer(
    device,
    queue,
    channelsKey,
    channelsData,
    `motion-output-format-channels-${archetypeId}`,
  );

  const paramsBuffer = getOrCreateParamsBuffer(device);
  const paramsData = new Uint32Array([
    usedRawValueCount >>> 0,
    safeRawStride >>> 0,
    channelCount >>> 0,
    0,
  ]);
  queue.writeBuffer(paramsBuffer, 0, paramsData.buffer as ArrayBuffer, 0, paramsData.byteLength);

  const formattedBufferSize = usedOutputValueCount * 4;
  const formattedBuffer = await outputFormatBufferPool.acquire(
    device,
    formattedBufferSize,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    `motion-output-format-formatted-${archetypeId}`,
  );

  const cmdEncoder = device.createCommandEncoder({
    label: `motion-output-format-encoder-${archetypeId}`,
  });

  const pass = cmdEncoder.beginComputePass();
  const bindGroup = device.createBindGroup({
    layout: outputFormatBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: rawOutputBuffer } },
      { binding: 1, resource: { buffer: channelsBuffer } },
      { binding: 2, resource: { buffer: formattedBuffer } },
      { binding: 3, resource: { buffer: paramsBuffer } },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);

  const workgroupSize = 64;
  const workgroupsX = Math.ceil(usedOutputValueCount / workgroupSize);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();

  queue.submit([cmdEncoder.finish()]);
  return formattedBuffer;
}

export function releaseOutputFormatBuffer(buffer: GPUBuffer, queue: GPUQueue): void {
  void outputFormatBufferPool.release(buffer, queue);
}

export function getOutputFormatBufferPoolStats(device: GPUDevice): OutputFormatPoolStats {
  return outputFormatBufferPool.getStatsForTests(device);
}

export function __getOutputFormatBufferPoolStatsForTests(device: GPUDevice): OutputFormatPoolStats {
  return getOutputFormatBufferPoolStats(device);
}
