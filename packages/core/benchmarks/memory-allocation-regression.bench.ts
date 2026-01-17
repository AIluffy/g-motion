import { describe, bench, expect, beforeEach } from 'vitest';
import { World } from '../src/world';
import { MotionStatus } from '../src/components/state';
import { MotionStateComponent } from '../src/components/state';
import { TimelineComponent, findActiveKeyframe } from '../src/components/timeline';
import { RenderComponent } from '../src/components/render';
import { TimeSystem } from '../src/systems/time';

import { BatchSamplingSystem, ComputeBatchProcessor } from '../src/systems/batch';
import {
  WebGPUComputeSystem,
  __resetWebGPUComputeSystemForTests,
} from '../src/systems/webgpu/system';
import { getGPUMetricsProvider } from '../src/webgpu/metrics-provider';
import { getAppContext } from '../src/context';
import type { EngineServices } from '../src/plugin';

let webgpuMockInstalled = false;

export function ensureMockWebGPU() {
  const g = globalThis as any;
  if (webgpuMockInstalled) return;
  const metrics =
    g.__webgpuTestMetrics ??
    (g.__webgpuTestMetrics = {
      dispatchCount: 0,
      totalBufferBytes: 0,
    });
  if (!g.GPUBufferUsage) {
    g.GPUBufferUsage = { STORAGE: 1, COPY_DST: 2, COPY_SRC: 4, QUERY_RESOLVE: 8, MAP_READ: 16 };
  }
  if (!g.GPUMapMode) {
    g.GPUMapMode = { READ: 1 };
  }
  class FakeBuffer {
    size: number;
    data: ArrayBuffer;
    constructor(size: number) {
      this.size = size;
      this.data = new ArrayBuffer(size);
    }
    destroy() {}
    getMappedRange(offset?: number, size?: number) {
      const start = offset ?? 0;
      const len = size ?? this.size;
      return this.data.slice(start, start + len);
    }
    unmap() {}
    mapAsync(_mode: number) {
      return Promise.resolve();
    }
  }
  class FakeComputePass {
    private metrics: { dispatchCount: number };
    constructor(metricsRef: { dispatchCount: number }) {
      this.metrics = metricsRef;
    }
    setPipeline(_pipeline: any) {}
    setBindGroup(_index: number, _group: any) {}
    dispatchWorkgroups(x: number, y?: number, z?: number) {
      const yy = y ?? 1;
      const zz = z ?? 1;
      this.metrics.dispatchCount += x * yy * zz;
    }
    end() {}
  }
  class FakeCommandEncoder {
    private metrics: { dispatchCount: number };
    constructor(metricsRef: { dispatchCount: number }) {
      this.metrics = metricsRef;
    }
    beginComputePass(): FakeComputePass {
      return new FakeComputePass(this.metrics);
    }
    finish(): any {
      return {};
    }
  }
  class FakePipeline {
    private layout: any;
    constructor(layout: any) {
      this.layout = layout;
    }
    getBindGroupLayout(_index: number) {
      if (this.layout && Array.isArray(this.layout.bindGroupLayouts)) {
        return this.layout.bindGroupLayouts[0];
      }
      return this.layout;
    }
  }
  class FakeDevice {
    features: { has: (name: string) => boolean };
    queue: {
      submit: (commandBuffers: any[]) => void;
      writeBuffer: (
        buffer: FakeBuffer,
        bufferOffset: number,
        data: ArrayBufferView,
        dataOffset?: number,
        size?: number,
      ) => void;
    };
    private lastBindGroupLayout: any;
    constructor() {
      this.features = { has: () => false };
      this.queue = {
        submit: (_cbs: any[]) => {},
        writeBuffer: (
          buffer: FakeBuffer,
          bufferOffset: number,
          data: ArrayBufferView,
          dataOffset?: number,
          size?: number,
        ) => {
          const offset = dataOffset ?? 0;
          const length = size ?? data.byteLength - offset;
          const src = new Uint8Array(data.buffer, data.byteOffset + offset, length);
          const dst = new Uint8Array(buffer.data);
          dst.set(src, bufferOffset);
        },
      };
    }
    createBuffer(options: { size: number }) {
      metrics.totalBufferBytes += options.size;
      return new FakeBuffer(options.size);
    }
    createShaderModule(config: { code: string }) {
      return { code: config.code };
    }
    createBindGroupLayout(config: { entries: any[] }) {
      const layout = { entries: config.entries };
      this.lastBindGroupLayout = layout;
      return layout;
    }
    createPipelineLayout(config: { bindGroupLayouts: any[] }) {
      return { bindGroupLayouts: config.bindGroupLayouts };
    }
    createComputePipeline(config: { layout: any }) {
      return new FakePipeline(config.layout);
    }
    createBindGroup(config: { layout: any; entries: any[] }) {
      return { layout: config.layout, entries: config.entries };
    }
    createCommandEncoder(_config?: { label?: string }) {
      return new FakeCommandEncoder(metrics);
    }
  }
  class FakeAdapter {
    features: { has: (name: string) => boolean };
    private device: FakeDevice;
    constructor(device: FakeDevice) {
      this.device = device;
      this.features = { has: () => false };
    }
    async requestDevice(_opts?: any) {
      return this.device;
    }
  }
  const device = new FakeDevice();
  const adapter = new FakeAdapter(device);
  if (!g.navigator) {
    g.navigator = {};
  }
  g.navigator.gpu = {
    requestAdapter: async () => adapter,
    __isFake: true,
  };
  webgpuMockInstalled = true;
}

function registerCoreComponents(world: World) {
  world.registry.register('MotionState', MotionStateComponent);
  world.registry.register('Timeline', TimelineComponent);
  world.registry.register('Render', RenderComponent);
}

describe('Zero Allocation Test', () => {
  let world: World;
  let services: EngineServices;

  beforeEach(() => {
    world = new World();
    registerCoreComponents(world);
    const batchProcessor = new ComputeBatchProcessor();
    const metrics = getGPUMetricsProvider();
    const appContext = getAppContext();
    services = {
      world,
      scheduler: world.scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor,
      metrics,
      errorHandler: appContext.getErrorHandler(),
      appContext,
    };
    world.scheduler.setServices(services);
    world.scheduler.add(TimeSystem);
  });

  bench('Zero allocation per frame - 100 entities over 10000 frames', () => {
    const entityCount = 100;
    for (let i = 0; i < entityCount; i++) {
      world.createEntity({
        MotionState: {
          status: MotionStatus.Running,
          startTime: 0,
          currentTime: 0,
          playbackRate: 1,
          delay: 0,
          iteration: 0,
          pausedAt: 0,
        },
        Timeline: {
          tracks: new Map(),
          duration: 1000,
          loop: 0,
          repeat: 0,
        },
        Render: {
          rendererId: 'object',
          target: { value: 0 },
          props: { value: 0 },
        },
      });
    }

    const initialHeap = process.memoryUsage().heapUsed;

    for (let frame = 0; frame < 10000; frame++) {
      // 使用真实 TimeSystem 逻辑推进 currentTime
      TimeSystem.update(16, { services, dt: 16, nowMs: frame * 16 } as any);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const allocated = finalHeap - initialHeap;
    const allocatedKB = allocated / 1024;

    console.log(`Allocated: ${allocatedKB.toFixed(2)}KB over 10000 frames`);
    expect(allocatedKB).toBeLessThan(100);
  });
});

describe('Timeline System Allocation', () => {
  let world: World;
  let services: EngineServices;

  beforeEach(() => {
    world = new World();
    registerCoreComponents(world);
    const batchProcessor = new ComputeBatchProcessor();
    const metrics = getGPUMetricsProvider();
    const appContext = getAppContext();
    services = {
      world,
      scheduler: world.scheduler,
      app: {} as any,
      config: {
        ...world.config,
      },
      batchProcessor,
      metrics,
      errorHandler: appContext.getErrorHandler(),
      appContext,
    };
    world.scheduler.setServices(services);
    world.scheduler.add(TimeSystem);
  });

  bench('Timeline system allocation - 500 entities', () => {
    for (let i = 0; i < 500; i++) {
      const tracks = new Map();
      tracks.set('x', [
        { startTime: 0, time: 100, startValue: 0, endValue: 100 },
        { startTime: 100, time: 200, startValue: 100, endValue: 200 },
      ]);
      world.createEntity({
        MotionState: {
          status: MotionStatus.Running,
          startTime: 0,
          currentTime: 0,
          playbackRate: 1,
          delay: 0,
          iteration: 0,
          pausedAt: 0,
        },
        Timeline: {
          tracks,
          duration: 200,
          loop: 0,
          repeat: 0,
        },
      });
    }

    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      TimeSystem.update(16, { services, dt: 16, nowMs: i * 16 } as any);
      for (const archetype of world.getArchetypes()) {
        const stateBuffer = archetype.getBuffer('MotionState');
        const timelineBuffer = archetype.getBuffer('Timeline');
        if (!stateBuffer || !timelineBuffer) continue;
        for (let j = 0; j < archetype.entityCount; j++) {
          const state = stateBuffer[j] as any;
          const timeline = timelineBuffer[j] as any;
          if (state.status !== MotionStatus.Running) continue;
          const track = (timeline.tracks as Map<string, any[]>).get('x');
          if (!track) continue;
          findActiveKeyframe(track, state.currentTime);
        }
      }
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const allocatedKB = (finalHeap - initialHeap) / 1024;
    console.log(`Timeline system allocated: ${allocatedKB.toFixed(2)}KB`);
    expect(allocatedKB).toBeLessThan(50);
  });
});

describe('Interpolation System Allocation', () => {
  let world: World;
  let services: EngineServices;

  beforeEach(() => {
    world = new World();
    registerCoreComponents(world);
    const batchProcessor = new ComputeBatchProcessor();
    const metrics = getGPUMetricsProvider();
    const appContext = getAppContext();
    services = {
      world,
      scheduler: world.scheduler,
      app: {} as any,
      config: world.config,
      batchProcessor,
      metrics,
      errorHandler: appContext.getErrorHandler(),
      appContext,
    };
    world.scheduler.setServices(services);
    world.scheduler.add(TimeSystem);
  });

  bench('Interpolation system allocation - 1000 entities', () => {
    for (let i = 0; i < 1000; i++) {
      const tracks = new Map();
      tracks.set('value', [{ startTime: 0, time: 100, startValue: 0, endValue: 100 }]);
      world.createEntity({
        MotionState: {
          status: MotionStatus.Running,
          startTime: 0,
          currentTime: 0,
          playbackRate: 1,
          delay: 0,
          iteration: 0,
          pausedAt: 0,
        },
        Timeline: {
          tracks,
          duration: 100,
          loop: 0,
          repeat: 0,
        },
        Render: {
          rendererId: 'primitive',
          target: { value: 0 },
          props: {},
        },
      });
    }

    const initialHeap = process.memoryUsage().heapUsed;

    for (let frame = 0; frame < 1000; frame++) {
      TimeSystem.update(16, { services, dt: 16, nowMs: frame * 16 } as any);
      for (const archetype of world.getArchetypes()) {
        const stateBuffer = archetype.getBuffer('MotionState');
        const timelineBuffer = archetype.getBuffer('Timeline');
        const renderBuffer = archetype.getBuffer('Render');
        if (!stateBuffer || !timelineBuffer || !renderBuffer) continue;
        for (let i = 0; i < archetype.entityCount; i++) {
          const state = stateBuffer[i] as any;
          const timeline = timelineBuffer[i] as any;
          const render = renderBuffer[i] as any;
          if (state.status !== MotionStatus.Running) continue;
          const track = (timeline.tracks as Map<string, any[]>).get('value');
          if (!track) continue;
          const kf = findActiveKeyframe(track, state.currentTime);
          if (kf) {
            const t = (state.currentTime - kf.startTime) / (kf.time - kf.startTime || 1);
            const v = kf.startValue + (kf.endValue - kf.startValue) * t;
            render.props.value = v;
          }
        }
      }
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const allocatedKB = (finalHeap - initialHeap) / 1024;
    console.log(`Interpolation system allocated: ${allocatedKB.toFixed(2)}KB`);
    expect(allocatedKB).toBeLessThan(50);
  });
});

describe('Batch Sampling Allocation', () => {
  let world: World;
  let services: EngineServices;

  beforeEach(() => {
    world = new World();
    registerCoreComponents(world);
    ensureMockWebGPU();
    __resetWebGPUComputeSystemForTests();
    const batchProcessor = new ComputeBatchProcessor();
    const metrics = getGPUMetricsProvider();
    const appContext = getAppContext();
    services = {
      world,
      scheduler: world.scheduler,
      app: {} as any,
      config: {
        ...world.config,
      },
      batchProcessor,
      metrics,
      errorHandler: appContext.getErrorHandler(),
      appContext,
    };
    world.scheduler.setServices(services);
    world.scheduler.add(TimeSystem);
    world.scheduler.add(BatchSamplingSystem);
  });

  bench('Batch sampling allocation - 2000 entities', async () => {
    for (let i = 0; i < 2000; i++) {
      const tracks = new Map();
      tracks.set('x', [{ startTime: 0, time: 100, startValue: 0, endValue: 100 }]);
      world.createEntity({
        MotionState: {
          status: MotionStatus.Running,
          startTime: 0,
          currentTime: 0,
          playbackRate: 1,
          delay: 0,
          iteration: 0,
          pausedAt: 0,
        },
        Timeline: {
          tracks,
          duration: 100,
          loop: 0,
          repeat: 0,
        },
      });
    }

    const initialHeap = process.memoryUsage().heapUsed;
    for (let i = 0; i < 500; i++) {
      const nowMs = i * 16;
      TimeSystem.update(16, { services, dt: 16, nowMs } as any);
      BatchSamplingSystem.update(16, { services, dt: 16, nowMs } as any);
      await WebGPUComputeSystem.update(16, { services, dt: 16, nowMs } as any);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const allocatedKB = (finalHeap - initialHeap) / 1024;
    console.log(`Batch sampling allocated: ${allocatedKB.toFixed(2)}KB`);
    expect(allocatedKB).toBeLessThan(100);
  });
});

describe('Readback Metrics Baseline', () => {
  let world: World;
  let services: EngineServices;

  beforeEach(() => {
    world = new World();
    registerCoreComponents(world);
    ensureMockWebGPU();
    __resetWebGPUComputeSystemForTests();
    const batchProcessor = new ComputeBatchProcessor();
    const metrics = getGPUMetricsProvider();
    metrics.clear();
    const appContext = getAppContext();
    services = {
      world,
      scheduler: world.scheduler,
      app: {} as any,
      config: {
        ...world.config,
      },
      batchProcessor,
      metrics,
      errorHandler: appContext.getErrorHandler(),
      appContext,
    };
    world.scheduler.setServices(services);
    world.scheduler.add(TimeSystem);
    world.scheduler.add(BatchSamplingSystem);
  });

  bench('Readback metrics per archetype', async () => {
    const archetypeACount = 200;
    const archetypeBCount = 200;

    for (let i = 0; i < archetypeACount; i++) {
      const tracks = new Map();
      tracks.set('__primitive', [{ startTime: 0, time: 100, startValue: 0, endValue: 100 }]);
      world.createEntity({
        MotionState: {
          status: MotionStatus.Running,
          startTime: 0,
          currentTime: 0,
          playbackRate: 1,
          delay: 0,
          iteration: 0,
          pausedAt: 0,
        },
        Timeline: {
          tracks,
          duration: 100,
          loop: 0,
          repeat: 0,
        },
        Render: {
          rendererId: 'primitive',
          target: { value: 0 },
          props: { __primitive: 0 },
        },
      });
    }

    for (let i = 0; i < archetypeBCount; i++) {
      const tracks = new Map();
      tracks.set('x', [{ startTime: 0, time: 200, startValue: 0, endValue: 200 }]);
      world.createEntity({
        MotionState: {
          status: MotionStatus.Running,
          startTime: 0,
          currentTime: 0,
          playbackRate: 1,
          delay: 0,
          iteration: 0,
          pausedAt: 0,
        },
        Timeline: {
          tracks,
          duration: 200,
          loop: 0,
          repeat: 0,
        },
      });
    }

    const frames = 20;
    for (let frame = 0; frame < frames; frame++) {
      const nowMs = frame * 16;
      TimeSystem.update(16, { services, dt: 16, nowMs } as any);
      BatchSamplingSystem.update(16, { services, dt: 16, nowMs } as any);
      await WebGPUComputeSystem.update(16, { services, dt: 16, nowMs } as any);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    const metricsProvider = getGPUMetricsProvider();
    const allMetrics = metricsProvider.getMetrics();
    const syncMetrics = allMetrics.filter(
      (m) => m.syncPerformed && typeof m.syncDataSize === 'number' && m.syncDataSize > 0,
    );

    expect(syncMetrics.length).toBeGreaterThan(0);

    const archetypeSummary = new Map<string, { bytes: number; ms: number; samples: number }>();

    for (const m of syncMetrics) {
      const id = m.batchId;
      const existing = archetypeSummary.get(id) || { bytes: 0, ms: 0, samples: 0 };
      const bytes = typeof m.syncDataSize === 'number' ? m.syncDataSize : 0;
      const ms = typeof m.syncDurationMs === 'number' ? m.syncDurationMs : 0;
      existing.bytes += bytes;
      existing.ms += ms;
      existing.samples += 1;
      archetypeSummary.set(id, existing);
    }

    expect(archetypeSummary.size).toBeGreaterThan(0);

    const rows: {
      archetype: string;
      samples: number;
      totalBytes: number;
      totalMs: number;
      avgBytes: number;
      avgMs: number;
    }[] = [];

    for (const [id, value] of archetypeSummary) {
      expect(value.bytes).toBeGreaterThan(0);
      const avgBytes = value.samples > 0 ? value.bytes / value.samples : 0;
      const avgMs = value.samples > 0 ? value.ms / value.samples : 0;
      rows.push({
        archetype: id,
        samples: value.samples,
        totalBytes: value.bytes,
        totalMs: value.ms,
        avgBytes,
        avgMs,
      });
    }

    rows.sort((a, b) => a.archetype.localeCompare(b.archetype));

    const header = ['archetype', 'samples', 'totalBytes', 'totalMs', 'avgBytes', 'avgMs'];
    console.log('Readback metrics baseline');
    console.log(header.join(', '));
    for (const row of rows) {
      const line = [
        row.archetype,
        String(row.samples),
        String(row.totalBytes),
        row.totalMs.toFixed(3),
        row.avgBytes.toFixed(1),
        row.avgMs.toFixed(3),
      ].join(', ');
      console.log(line);
      expect(row.avgMs).toBeLessThan(50);
    }
  });
});
