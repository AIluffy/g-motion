import { describe, bench, expect, afterAll } from 'vitest';
import {
  KEYFRAME_SEARCH_SHADER,
  KEYFRAME_SEARCH_SHADER_OPT,
  PACKED_KEYFRAME_STRIDE,
} from '@g-motion/webgpu';
import { ComputeBenchmark } from '@g-motion/webgpu';
import { ensureMockWebGPU } from './memory-allocation-regression.bench';

type ShaderBinding = {
  binding: number;
  visibility: number;
  buffer?: {
    type: 'storage' | 'read-only-storage' | 'uniform';
  };
  sampler?: {
    type: 'filtering' | 'non-filtering' | 'comparison';
  };
  texture?: {
    sampleType?: 'float' | 'unfilterable-float' | 'sint' | 'uint';
    viewDimension?: '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
  };
};

type ComputeShaderConfig = {
  name: string;
  code: string;
  entryPoint?: string;
  bindings: ShaderBinding[];
};

type ComputeShaderMetadata = {
  name: string;
  compiledAt: number;
  entryPoint: string;
  bindingCount: number;
  workgroupSize: [number, number, number];
};

type ComputeShader = {
  metadata: ComputeShaderMetadata;
  bindGroupLayout: any;
  pipelineLayout: any;
  pipeline: any;
};

function parseWorkgroupSize(code: string): [number, number, number] {
  const m = /@workgroup_size\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?(?:,\s*(\d+)\s*)?\)/.exec(code);
  if (!m) return [64, 1, 1];
  const x = Number(m[1]);
  const y = m[2] ? Number(m[2]) : 1;
  const z = m[3] ? Number(m[3]) : 1;
  return [x || 64, y || 1, z || 1];
}

async function compileComputeShader(
  device: any,
  config: ComputeShaderConfig,
): Promise<ComputeShader> {
  const entryPoint = config.entryPoint || 'main';
  const bindGroupLayout = device.createBindGroupLayout({
    entries: config.bindings,
  });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });
  const module = device.createShaderModule({
    code: config.code,
  });
  const pipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: {
      module,
      entryPoint,
    },
  });
  return {
    metadata: {
      name: config.name,
      compiledAt: Date.now(),
      entryPoint,
      bindingCount: config.bindings.length,
      workgroupSize: parseWorkgroupSize(config.code),
    },
    bindGroupLayout,
    pipelineLayout,
    pipeline,
  };
}

type PackedTrackItem = {
  startTime: number;
  duration: number;
  startValue: number;
  endValue: number;
};

type AccessPattern = 'baseline' | 'sequential' | 'random' | 'chunked';

type KeyframePatternMetrics = {
  name: string;
  pattern: AccessPattern;
  entityCount: number;
  keyframesPerEntity: number;
  workgroupSize: number;
  workgroupCount: number;
  avgKeyframesPerWorkgroup: number;
  dispatchDelta: number;
  totalBufferBytesDelta: number;
  cpuAvgTimeMs: number;
  gpuAvgTimeMs: number;
  speedup: number;
};

const keyframePatternMetrics: KeyframePatternMetrics[] = [];

type Rng = () => number;

function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function floatToHalfBitsTS(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  if (!Number.isFinite(value)) {
    return value > 0 ? 0x7c00 : 0xfc00;
  }
  if (value === 0) {
    return 1 / value === -Infinity ? 0x8000 : 0;
  }
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);
  floatView[0] = value;
  const bits = intView[0];
  const sign = (bits >> 16) & 0x8000;
  let exponent = ((bits >> 23) & 0xff) - 127 + 15;
  let mantissa = bits & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) {
      return sign;
    }
    mantissa = (mantissa | 0x800000) >> (1 - exponent);
    exponent = 0;
  } else if (exponent >= 31) {
    return sign | 0x7c00;
  } else {
    mantissa >>= 13;
  }
  return sign | (exponent << 10) | (mantissa & 0x3ff);
}

function packHalfsTS(a: number, b: number): number {
  const ha = floatToHalfBitsTS(a) & 0xffff;
  const hb = floatToHalfBitsTS(b) & 0xffff;
  return ha | (hb << 16);
}

function packEasingFlagsTS(easingId: number, easingMode: number): number {
  const idBits = easingId & 0xffff;
  const modeBits = (easingMode & 0x3) << 16;
  return idBits | modeBits;
}

function createPackedKeyframes(count: number) {
  const stride = PACKED_KEYFRAME_STRIDE;
  const data = new Uint32Array(count * stride);
  const track: PackedTrackItem[] = [];
  for (let i = 0; i < count; i++) {
    const startTime = i * 10;
    const duration = 10;
    const startValue = i;
    const endValue = i + 1;
    const base = i * stride;
    data[base + 0] = packHalfsTS(startTime, duration);
    data[base + 1] = packHalfsTS(startValue, endValue);
    data[base + 2] = packHalfsTS(0, 0);
    data[base + 3] = packHalfsTS(1, 1);
    data[base + 4] = packEasingFlagsTS(0, 0);
    track.push({ startTime, duration, startValue, endValue });
  }
  return { data, track };
}

function createSearchTimes(entityCount: number, lastEndTime: number) {
  const times = new Float32Array(entityCount);
  for (let i = 0; i < entityCount; i++) {
    times[i] = (i / entityCount) * lastEndTime;
  }
  return times;
}

function createRandomSearchTimes(entityCount: number, lastEndTime: number) {
  const rng = createRng(1);
  const times = new Float32Array(entityCount);
  for (let i = 0; i < entityCount; i++) {
    times[i] = rng() * lastEndTime;
  }
  return times;
}

function createChunkedSearchTimes(entityCount: number, lastEndTime: number) {
  const rng = createRng(2);
  const times = new Float32Array(entityCount);
  const chunkSize = 32;
  for (let i = 0; i < entityCount; i += chunkSize) {
    const base = rng() * lastEndTime;
    const end = Math.min(entityCount, i + chunkSize);
    for (let j = i; j < end; j++) {
      const t = (j - i) / Math.max(1, end - i - 1);
      const offset = (t - 0.5) * (lastEndTime / entityCount);
      let value = base + offset;
      if (value < 0) value = 0;
      if (value > lastEndTime) value = lastEndTime;
      times[j] = value;
    }
  }
  return times;
}

function getGlobalWebGPUMetrics() {
  const g = globalThis as any;
  const m = g.__webgpuTestMetrics as
    | { dispatchCount: number; totalBufferBytes: number }
    | undefined;
  if (!m) return null;
  return {
    dispatchCount: m.dispatchCount,
    totalBufferBytes: m.totalBufferBytes,
  };
}

function recordKeyframePatternMetrics(params: {
  name: string;
  pattern: AccessPattern;
  entityCount: number;
  keyframesPerEntity: number;
  workgroupSize: number;
  workgroupCount: number;
  cpuAvgTime: number;
  gpuAvgTime: number;
  speedup: number;
  dispatchDelta: number;
  totalBufferBytesDelta: number;
}) {
  const avgKeyframesPerWorkgroup =
    params.workgroupCount > 0
      ? (params.entityCount * params.keyframesPerEntity) / params.workgroupCount
      : 0;
  keyframePatternMetrics.push({
    name: params.name,
    pattern: params.pattern,
    entityCount: params.entityCount,
    keyframesPerEntity: params.keyframesPerEntity,
    workgroupSize: params.workgroupSize,
    workgroupCount: params.workgroupCount,
    avgKeyframesPerWorkgroup,
    dispatchDelta: params.dispatchDelta,
    totalBufferBytesDelta: params.totalBufferBytesDelta,
    cpuAvgTimeMs: params.cpuAvgTime,
    gpuAvgTimeMs: params.gpuAvgTime,
    speedup: params.speedup,
  });
}

function cpuSearchKeyframe(time: number, track: PackedTrackItem[]) {
  if (track.length === 0) {
    return { index: 0, progress: 0 };
  }
  const threshold = 20;
  if (track.length < threshold) {
    let lastIndex = 0;
    for (let i = 0; i < track.length; i++) {
      const k = track[i];
      const start = k.startTime;
      const end = k.startTime + k.duration;
      if (time >= start && time <= end) {
        const duration = end - start || 1;
        const p = (time - start) / duration;
        return { index: i, progress: p };
      }
      if (time > end) {
        lastIndex = i;
      }
    }
    if (time < track[0].startTime) {
      return { index: 0, progress: 0 };
    }
    const clamped = Math.min(lastIndex, track.length - 1);
    return { index: clamped, progress: 1 };
  }
  let left = 0;
  let right = track.length;
  while (left < right) {
    const mid = (left + right) >>> 1;
    const k = track[mid];
    const start = k.startTime;
    const end = k.startTime + k.duration;
    if (time < start) {
      right = mid;
    } else if (time > end) {
      left = mid + 1;
    } else {
      const duration = end - start || 1;
      const p = (time - start) / duration;
      return { index: mid, progress: p };
    }
  }
  if (left > 0 && left < track.length) {
    return { index: left - 1, progress: 1 };
  }
  if (left === 0 && track.length > 0) {
    return { index: 0, progress: 0 };
  }
  return { index: track.length - 1, progress: 1 };
}

async function createKeyframeSearchResources(
  entityCount: number,
  keyframesPerEntity: number,
  withData: boolean,
) {
  ensureMockWebGPU();
  const g = globalThis as any;
  const adapter = await g.navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU adapter unavailable');
  }
  const device = await adapter.requestDevice();
  const shader = await compileComputeShader(device, {
    name: 'keyframe-search',
    code: KEYFRAME_SEARCH_SHADER,
    entryPoint: 'findActiveKeyframes',
    bindings: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: 4, buffer: { type: 'storage' } },
    ],
  });
  const usage = g.GPUBufferUsage;
  const keyframeCount = entityCount * keyframesPerEntity;
  const keyframesBufferSize = keyframeCount * PACKED_KEYFRAME_STRIDE * 4;
  const searchTimesBufferSize = entityCount * 4;
  const offsetsBufferSize = entityCount * 4;
  const countsBufferSize = entityCount * 4;
  const resultsBufferSize = entityCount * 4 * 4;
  const keyframesBuffer = device.createBuffer({
    size: keyframesBufferSize,
    usage: usage.STORAGE,
  });
  const searchTimesBuffer = device.createBuffer({
    size: searchTimesBufferSize,
    usage: usage.STORAGE,
  });
  const offsetsBuffer = device.createBuffer({
    size: offsetsBufferSize,
    usage: usage.STORAGE,
  });
  const countsBuffer = device.createBuffer({
    size: countsBufferSize,
    usage: usage.STORAGE,
  });
  const resultsBuffer = device.createBuffer({
    size: resultsBufferSize,
    usage: usage.STORAGE | usage.COPY_SRC | usage.MAP_READ,
  });
  let cpuTrack: PackedTrackItem[] | undefined;
  if (withData) {
    const packed = createPackedKeyframes(keyframesPerEntity);
    cpuTrack = packed.track;
    const lastEnd =
      packed.track[packed.track.length - 1].startTime +
      packed.track[packed.track.length - 1].duration;
    const times = createSearchTimes(entityCount, lastEnd);
    const offsets = new Uint32Array(entityCount);
    const counts = new Uint32Array(entityCount);
    for (let i = 0; i < entityCount; i++) {
      offsets[i] = 0;
      counts[i] = keyframesPerEntity;
    }
    device.queue.writeBuffer(keyframesBuffer, 0, packed.data);
    device.queue.writeBuffer(searchTimesBuffer, 0, times);
    device.queue.writeBuffer(offsetsBuffer, 0, offsets);
    device.queue.writeBuffer(countsBuffer, 0, counts);
  }
  const bindGroup = device.createBindGroup({
    layout: shader.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: keyframesBuffer } },
      { binding: 1, resource: { buffer: searchTimesBuffer } },
      { binding: 2, resource: { buffer: offsetsBuffer } },
      { binding: 3, resource: { buffer: countsBuffer } },
      { binding: 4, resource: { buffer: resultsBuffer } },
    ],
  });
  const workgroupSize = shader.metadata.workgroupSize[0] || 64;
  const workgroupCount = Math.ceil(entityCount / workgroupSize);
  return {
    device,
    shader,
    bindGroup,
    workgroupSize,
    workgroupCount,
    keyframesBuffer,
    searchTimesBuffer,
    offsetsBuffer,
    countsBuffer,
    resultsBuffer,
    cpuTrack,
  };
}

async function createKeyframeSearchResourcesOptimized(
  entityCount: number,
  keyframesPerEntity: number,
  withData: boolean,
) {
  ensureMockWebGPU();
  const g = globalThis as any;
  const adapter = await g.navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU adapter unavailable');
  }
  const device = await adapter.requestDevice();
  const shader = await compileComputeShader(device, {
    name: 'keyframe-search-opt',
    code: KEYFRAME_SEARCH_SHADER_OPT,
    entryPoint: 'findActiveKeyframes',
    bindings: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: 4, buffer: { type: 'storage' } },
    ],
  });
  const usage = g.GPUBufferUsage;
  const keyframeCount = entityCount * keyframesPerEntity;
  const keyframesBufferSize = keyframeCount * PACKED_KEYFRAME_STRIDE * 4;
  const searchTimesBufferSize = entityCount * 4;
  const offsetsBufferSize = entityCount * 4;
  const countsBufferSize = entityCount * 4;
  const resultsBufferSize = entityCount * 4 * 4;
  const keyframesBuffer = device.createBuffer({
    size: keyframesBufferSize,
    usage: usage.STORAGE,
  });
  const searchTimesBuffer = device.createBuffer({
    size: searchTimesBufferSize,
    usage: usage.STORAGE,
  });
  const offsetsBuffer = device.createBuffer({
    size: offsetsBufferSize,
    usage: usage.STORAGE,
  });
  const countsBuffer = device.createBuffer({
    size: countsBufferSize,
    usage: usage.STORAGE,
  });
  const resultsBuffer = device.createBuffer({
    size: resultsBufferSize,
    usage: usage.STORAGE | usage.COPY_SRC | usage.MAP_READ,
  });
  let cpuTrack: PackedTrackItem[] | undefined;
  if (withData) {
    const packed = createPackedKeyframes(keyframesPerEntity);
    cpuTrack = packed.track;
    const lastEnd =
      packed.track[packed.track.length - 1].startTime +
      packed.track[packed.track.length - 1].duration;
    const times = createSearchTimes(entityCount, lastEnd);
    const offsets = new Uint32Array(entityCount);
    const counts = new Uint32Array(entityCount);
    for (let i = 0; i < entityCount; i++) {
      offsets[i] = 0;
      counts[i] = keyframesPerEntity;
    }
    device.queue.writeBuffer(keyframesBuffer, 0, packed.data);
    device.queue.writeBuffer(searchTimesBuffer, 0, times);
    device.queue.writeBuffer(offsetsBuffer, 0, offsets);
    device.queue.writeBuffer(countsBuffer, 0, counts);
  }
  const bindGroup = device.createBindGroup({
    layout: shader.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: keyframesBuffer } },
      { binding: 1, resource: { buffer: searchTimesBuffer } },
      { binding: 2, resource: { buffer: offsetsBuffer } },
      { binding: 3, resource: { buffer: countsBuffer } },
      { binding: 4, resource: { buffer: resultsBuffer } },
    ],
  });
  const workgroupSize = shader.metadata.workgroupSize[0] || 64;
  const workgroupCount = Math.ceil(entityCount / workgroupSize);
  return {
    device,
    shader,
    bindGroup,
    workgroupSize,
    workgroupCount,
    keyframesBuffer,
    searchTimesBuffer,
    offsetsBuffer,
    countsBuffer,
    resultsBuffer,
    cpuTrack,
  };
}

async function dispatchKeyframeSearch(
  device: any,
  shader: any,
  bindGroup: any,
  workgroupCount: number,
) {
  const encoder = device.createCommandEncoder({});
  const pass = encoder.beginComputePass();
  pass.setPipeline(shader.pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupCount, 1, 1);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

describe('GPU Keyframe Search Shader', () => {
  bench('Compile and dispatch small batch (1024 entities, 16 keyframes)', async () => {
    const { device, shader, bindGroup, workgroupCount } = await createKeyframeSearchResources(
      1024,
      16,
      false,
    );
    await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
    expect(shader.metadata.bindingCount).toBe(5);
  });
  bench('Compile and dispatch medium batch (4096 entities, 32 keyframes)', async () => {
    const { device, shader, bindGroup, workgroupCount } = await createKeyframeSearchResources(
      4096,
      32,
      false,
    );
    await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
    expect(shader.metadata.bindingCount).toBe(5);
  });
  bench('Compile and dispatch large batch (16384 entities, 64 keyframes)', async () => {
    const { device, shader, bindGroup, workgroupCount } = await createKeyframeSearchResources(
      16384,
      64,
      false,
    );
    await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
    expect(shader.metadata.bindingCount).toBe(5);
  });
  bench('CPU vs GPU keyframe search correctness and performance', async () => {
    const entityCount = 2048;
    const keyframesPerEntity = 64;
    const resources = await createKeyframeSearchResources(entityCount, keyframesPerEntity, true);
    const { device, shader, bindGroup, workgroupSize, workgroupCount, resultsBuffer, cpuTrack } =
      resources;
    const g = globalThis as any;
    const benchmark = new ComputeBenchmark();
    const metricsBefore = getGlobalWebGPUMetrics();
    const cpuFn = async () => {
      if (!cpuTrack) return;
      const lastEnd =
        cpuTrack[cpuTrack.length - 1].startTime + cpuTrack[cpuTrack.length - 1].duration;
      const times = createSearchTimes(entityCount, lastEnd);
      let sum = 0;
      for (let i = 0; i < times.length; i++) {
        const r = cpuSearchKeyframe(times[i], cpuTrack);
        sum += r.index;
      }
      if (sum === -1) {
        throw new Error('unreachable');
      }
    };
    const gpuFn = async () => {
      await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
      await resultsBuffer.mapAsync(g.GPUMapMode.READ);
      const mapped = resultsBuffer.getMappedRange(0, entityCount * 16);
      const viewU32 = new Uint32Array(mapped);
      const viewF32 = new Float32Array(mapped);
      const isFake = !!g.navigator && !!g.navigator.gpu && !!(g.navigator.gpu as any).__isFake;
      if (!cpuTrack) {
        return;
      }
      if (!isFake) {
        const lastEnd =
          cpuTrack[cpuTrack.length - 1].startTime + cpuTrack[cpuTrack.length - 1].duration;
        const times = createSearchTimes(entityCount, lastEnd);
        for (let i = 0; i < entityCount; i++) {
          const cpu = cpuSearchKeyframe(times[i], cpuTrack);
          const base = i * 4;
          const gpuIndex = viewU32[base + 0];
          const gpuIsActive = viewU32[base + 1];
          const gpuProgress = viewF32[base + 2];
          expect(gpuIsActive).toBe(1);
          expect(gpuIndex % keyframesPerEntity).toBe(cpu.index);
          expect(gpuProgress).toBeCloseTo(cpu.progress, 3);
        }
      } else {
        expect(viewU32.length).toBeGreaterThan(0);
      }
    };
    const result = await benchmark.compareCPUvGPU('keyframe-search', cpuFn, gpuFn, {
      iterations: 3,
    });
    expect(result.cpu.avgTime).toBeGreaterThan(0);
    expect(result.gpu.avgTime).toBeGreaterThan(0);
    const metricsAfter = getGlobalWebGPUMetrics();
    const dispatchDelta =
      metricsBefore && metricsAfter ? metricsAfter.dispatchCount - metricsBefore.dispatchCount : 0;
    const totalBufferBytesDelta =
      metricsBefore && metricsAfter
        ? metricsAfter.totalBufferBytes - metricsBefore.totalBufferBytes
        : 0;
    recordKeyframePatternMetrics({
      name: 'keyframe-search',
      pattern: 'baseline',
      entityCount,
      keyframesPerEntity,
      workgroupSize,
      workgroupCount,
      cpuAvgTime: result.cpu.avgTime,
      gpuAvgTime: result.gpu.avgTime,
      speedup: result.speedup,
      dispatchDelta,
      totalBufferBytesDelta,
    });
    const metrics = g.__webgpuTestMetrics;
    if (metrics) {
      const beforeDispatch = metrics.dispatchCount;
      await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
      const afterDispatch = metrics.dispatchCount;
      expect(afterDispatch).toBeGreaterThan(beforeDispatch);
      expect(metrics.totalBufferBytes).toBeGreaterThan(0);
    }
  });
  bench('CPU vs GPU keyframe search correctness and performance (optimized shader)', async () => {
    const entityCount = 2048;
    const keyframesPerEntity = 64;
    const resources = await createKeyframeSearchResourcesOptimized(
      entityCount,
      keyframesPerEntity,
      true,
    );
    const { device, shader, bindGroup, workgroupSize, workgroupCount, resultsBuffer, cpuTrack } =
      resources;
    const g = globalThis as any;
    const benchmark = new ComputeBenchmark();
    const metricsBefore = getGlobalWebGPUMetrics();
    const cpuFn = async () => {
      if (!cpuTrack) return;
      const lastEnd =
        cpuTrack[cpuTrack.length - 1].startTime + cpuTrack[cpuTrack.length - 1].duration;
      const times = createSearchTimes(entityCount, lastEnd);
      let sum = 0;
      for (let i = 0; i < times.length; i++) {
        const r = cpuSearchKeyframe(times[i], cpuTrack);
        sum += r.index;
      }
      if (sum === -1) {
        throw new Error('unreachable');
      }
    };
    const gpuFn = async () => {
      await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
      await resultsBuffer.mapAsync(g.GPUMapMode.READ);
      const mapped = resultsBuffer.getMappedRange(0, entityCount * 16);
      const viewU32 = new Uint32Array(mapped);
      const viewF32 = new Float32Array(mapped);
      const isFake = !!g.navigator && !!g.navigator.gpu && !!(g.navigator.gpu as any).__isFake;
      if (!cpuTrack) {
        return;
      }
      if (!isFake) {
        const lastEnd =
          cpuTrack[cpuTrack.length - 1].startTime + cpuTrack[cpuTrack.length - 1].duration;
        const times = createSearchTimes(entityCount, lastEnd);
        for (let i = 0; i < entityCount; i++) {
          const cpu = cpuSearchKeyframe(times[i], cpuTrack);
          const base = i * 4;
          const gpuIndex = viewU32[base + 0];
          const gpuIsActive = viewU32[base + 1];
          const gpuProgress = viewF32[base + 2];
          expect(gpuIsActive).toBe(1);
          expect(gpuIndex % keyframesPerEntity).toBe(cpu.index);
          expect(gpuProgress).toBeCloseTo(cpu.progress, 3);
        }
      } else {
        expect(viewU32.length).toBeGreaterThan(0);
      }
    };
    const result = await benchmark.compareCPUvGPU('keyframe-search-opt', cpuFn, gpuFn, {
      iterations: 3,
    });
    expect(result.cpu.avgTime).toBeGreaterThan(0);
    expect(result.gpu.avgTime).toBeGreaterThan(0);
    const metricsAfter = getGlobalWebGPUMetrics();
    const dispatchDelta =
      metricsBefore && metricsAfter ? metricsAfter.dispatchCount - metricsBefore.dispatchCount : 0;
    const totalBufferBytesDelta =
      metricsBefore && metricsAfter
        ? metricsAfter.totalBufferBytes - metricsBefore.totalBufferBytes
        : 0;
    recordKeyframePatternMetrics({
      name: 'keyframe-search-opt',
      pattern: 'baseline',
      entityCount,
      keyframesPerEntity,
      workgroupSize,
      workgroupCount,
      cpuAvgTime: result.cpu.avgTime,
      gpuAvgTime: result.gpu.avgTime,
      speedup: result.speedup,
      dispatchDelta,
      totalBufferBytesDelta,
    });
    const metrics = g.__webgpuTestMetrics;
    if (metrics) {
      const beforeDispatch = metrics.dispatchCount;
      await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
      const afterDispatch = metrics.dispatchCount;
      expect(afterDispatch).toBeGreaterThan(beforeDispatch);
      expect(metrics.totalBufferBytes).toBeGreaterThan(0);
    }
  });
  bench('CPU vs GPU keyframe search - sequential playback pattern', async () => {
    const entityCount = 4096;
    const keyframesPerEntity = 64;
    const resources = await createKeyframeSearchResources(entityCount, keyframesPerEntity, true);
    const {
      device,
      shader,
      bindGroup,
      workgroupSize,
      workgroupCount,
      searchTimesBuffer,
      cpuTrack,
    } = resources;
    const g = globalThis as any;
    const benchmark = new ComputeBenchmark();
    if (!cpuTrack) {
      return;
    }
    const lastEnd =
      cpuTrack[cpuTrack.length - 1].startTime + cpuTrack[cpuTrack.length - 1].duration;
    const times = createSearchTimes(entityCount, lastEnd);
    device.queue.writeBuffer(searchTimesBuffer, 0, times);
    const cpuFn = async () => {
      let sum = 0;
      for (let i = 0; i < times.length; i++) {
        const r = cpuSearchKeyframe(times[i], cpuTrack);
        sum += r.index;
      }
      if (sum === -1) {
        throw new Error('unreachable');
      }
    };
    const gpuFn = async () => {
      await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
      await resources.resultsBuffer.mapAsync(g.GPUMapMode.READ);
      const mapped = resources.resultsBuffer.getMappedRange(0, entityCount * 16);
      const viewU32 = new Uint32Array(mapped);
      expect(viewU32.length).toBeGreaterThan(0);
    };
    const metricsBefore = getGlobalWebGPUMetrics();
    const result = await benchmark.compareCPUvGPU('keyframe-search-sequential', cpuFn, gpuFn, {
      iterations: 3,
    });
    expect(result.cpu.avgTime).toBeGreaterThan(0);
    expect(result.gpu.avgTime).toBeGreaterThan(0);
    const metricsAfter = getGlobalWebGPUMetrics();
    const dispatchDelta =
      metricsBefore && metricsAfter ? metricsAfter.dispatchCount - metricsBefore.dispatchCount : 0;
    const totalBufferBytesDelta =
      metricsBefore && metricsAfter
        ? metricsAfter.totalBufferBytes - metricsBefore.totalBufferBytes
        : 0;
    recordKeyframePatternMetrics({
      name: 'keyframe-search-sequential',
      pattern: 'sequential',
      entityCount,
      keyframesPerEntity,
      workgroupSize,
      workgroupCount,
      cpuAvgTime: result.cpu.avgTime,
      gpuAvgTime: result.gpu.avgTime,
      speedup: result.speedup,
      dispatchDelta,
      totalBufferBytesDelta,
    });
  });
  bench('CPU vs GPU keyframe search - random access pattern', async () => {
    const entityCount = 4096;
    const keyframesPerEntity = 64;
    const resources = await createKeyframeSearchResources(entityCount, keyframesPerEntity, true);
    const {
      device,
      shader,
      bindGroup,
      workgroupSize,
      workgroupCount,
      searchTimesBuffer,
      cpuTrack,
    } = resources;
    const g = globalThis as any;
    const benchmark = new ComputeBenchmark();
    if (!cpuTrack) {
      return;
    }
    const lastEnd =
      cpuTrack[cpuTrack.length - 1].startTime + cpuTrack[cpuTrack.length - 1].duration;
    const times = createRandomSearchTimes(entityCount, lastEnd);
    device.queue.writeBuffer(searchTimesBuffer, 0, times);
    const cpuFn = async () => {
      let sum = 0;
      for (let i = 0; i < times.length; i++) {
        const r = cpuSearchKeyframe(times[i], cpuTrack);
        sum += r.index;
      }
      if (sum === -1) {
        throw new Error('unreachable');
      }
    };
    const gpuFn = async () => {
      await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
      await resources.resultsBuffer.mapAsync(g.GPUMapMode.READ);
      const mapped = resources.resultsBuffer.getMappedRange(0, entityCount * 16);
      const viewU32 = new Uint32Array(mapped);
      expect(viewU32.length).toBeGreaterThan(0);
    };
    const metricsBefore = getGlobalWebGPUMetrics();
    const result = await benchmark.compareCPUvGPU('keyframe-search-random', cpuFn, gpuFn, {
      iterations: 3,
    });
    expect(result.cpu.avgTime).toBeGreaterThan(0);
    expect(result.gpu.avgTime).toBeGreaterThan(0);
    const metricsAfter = getGlobalWebGPUMetrics();
    const dispatchDelta =
      metricsBefore && metricsAfter ? metricsAfter.dispatchCount - metricsBefore.dispatchCount : 0;
    const totalBufferBytesDelta =
      metricsBefore && metricsAfter
        ? metricsAfter.totalBufferBytes - metricsBefore.totalBufferBytes
        : 0;
    recordKeyframePatternMetrics({
      name: 'keyframe-search-random',
      pattern: 'random',
      entityCount,
      keyframesPerEntity,
      workgroupSize,
      workgroupCount,
      cpuAvgTime: result.cpu.avgTime,
      gpuAvgTime: result.gpu.avgTime,
      speedup: result.speedup,
      dispatchDelta,
      totalBufferBytesDelta,
    });
  });
  bench('CPU vs GPU keyframe search - chunked access pattern', async () => {
    const entityCount = 4096;
    const keyframesPerEntity = 64;
    const resources = await createKeyframeSearchResources(entityCount, keyframesPerEntity, true);
    const {
      device,
      shader,
      bindGroup,
      workgroupSize,
      workgroupCount,
      searchTimesBuffer,
      cpuTrack,
    } = resources;
    const g = globalThis as any;
    const benchmark = new ComputeBenchmark();
    if (!cpuTrack) {
      return;
    }
    const lastEnd =
      cpuTrack[cpuTrack.length - 1].startTime + cpuTrack[cpuTrack.length - 1].duration;
    const times = createChunkedSearchTimes(entityCount, lastEnd);
    device.queue.writeBuffer(searchTimesBuffer, 0, times);
    const cpuFn = async () => {
      let sum = 0;
      for (let i = 0; i < times.length; i++) {
        const r = cpuSearchKeyframe(times[i], cpuTrack);
        sum += r.index;
      }
      if (sum === -1) {
        throw new Error('unreachable');
      }
    };
    const gpuFn = async () => {
      await dispatchKeyframeSearch(device, shader, bindGroup, workgroupCount);
      await resources.resultsBuffer.mapAsync(g.GPUMapMode.READ);
      const mapped = resources.resultsBuffer.getMappedRange(0, entityCount * 16);
      const viewU32 = new Uint32Array(mapped);
      expect(viewU32.length).toBeGreaterThan(0);
    };
    const metricsBefore = getGlobalWebGPUMetrics();
    const result = await benchmark.compareCPUvGPU('keyframe-search-chunked', cpuFn, gpuFn, {
      iterations: 3,
    });
    expect(result.cpu.avgTime).toBeGreaterThan(0);
    expect(result.gpu.avgTime).toBeGreaterThan(0);
    const metricsAfter = getGlobalWebGPUMetrics();
    const dispatchDelta =
      metricsBefore && metricsAfter ? metricsAfter.dispatchCount - metricsBefore.dispatchCount : 0;
    const totalBufferBytesDelta =
      metricsBefore && metricsAfter
        ? metricsAfter.totalBufferBytes - metricsBefore.totalBufferBytes
        : 0;
    recordKeyframePatternMetrics({
      name: 'keyframe-search-chunked',
      pattern: 'chunked',
      entityCount,
      keyframesPerEntity,
      workgroupSize,
      workgroupCount,
      cpuAvgTime: result.cpu.avgTime,
      gpuAvgTime: result.gpu.avgTime,
      speedup: result.speedup,
      dispatchDelta,
      totalBufferBytesDelta,
    });
  });
});

afterAll(() => {
  if (keyframePatternMetrics.length === 0) {
    return;
  }
  const header = [
    'pattern',
    'entities',
    'kf/entity',
    'wgSize',
    'wgCount',
    'kf/wg',
    'dispatch',
    'bufBytes',
    'cpuAvgMs',
    'gpuAvgMs',
    'speedup',
  ];
  const rows = keyframePatternMetrics.map((m) => [
    m.pattern,
    String(m.entityCount),
    String(m.keyframesPerEntity),
    String(m.workgroupSize),
    String(m.workgroupCount),
    m.avgKeyframesPerWorkgroup.toFixed(2),
    String(m.dispatchDelta),
    String(m.totalBufferBytesDelta),
    m.cpuAvgTimeMs.toFixed(3),
    m.gpuAvgTimeMs.toFixed(3),
    m.speedup.toFixed(2),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const formatRow = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  const separator = widths.map((w) => ''.padEnd(w, '-')).join('  ');
  console.log('GPU keyframe search benchmark report');
  console.log(formatRow(header));
  console.log(separator);
  for (const r of rows) {
    console.log(formatRow(r));
  }
});
