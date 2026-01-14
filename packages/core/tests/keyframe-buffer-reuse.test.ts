import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistentGPUBufferManager } from '../src/webgpu/persistent-buffer-manager';
import { runKeyframeSearchPass } from '../src/systems/webgpu/keyframe/search-pass';
import { runKeyframeInterpPass } from '../src/systems/webgpu/keyframe/interp-pass';
import { runKeyframePreprocessPass } from '../src/systems/webgpu/keyframe/preprocess-pass';
import { StagingBufferPool } from '../src/webgpu/staging-pool';
import { CHANNEL_MAP_STRIDE, RAW_KEYFRAME_STRIDE } from '../src/webgpu/keyframe-preprocess-shader';

function createMockDevice() {
  let createBufferCalls = 0;
  let writeBufferCalls = 0;

  const device: any = {
    createBuffer: (descriptor: any) => {
      createBufferCalls++;
      const buf: any = {
        size: descriptor.size,
        usage: descriptor.usage,
        label: descriptor.label,
        getMappedRange: () => new ArrayBuffer(descriptor.size ?? 0),
        unmap: () => {},
        destroy: () => {},
      };
      return buf;
    },
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createComputePipeline: () => ({}),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      copyBufferToBuffer: () => {},
      beginComputePass: () => ({
        setPipeline: () => {},
        setBindGroup: () => {},
        dispatchWorkgroups: () => {},
        end: () => {},
      }),
      finish: () => ({}),
    }),
    queue: {
      writeBuffer: () => {
        writeBufferCalls++;
      },
      submit: () => {},
    },
  };

  return {
    device,
    getCreateBufferCalls: () => createBufferCalls,
    getWriteBufferCalls: () => writeBufferCalls,
  };
}

function createPreprocess(entryCount: number, rawKeyframeStride: number, channelMapStride: number) {
  const rawKeyframeData = new Float32Array(rawKeyframeStride);

  const mapData = new Uint32Array(entryCount * channelMapStride);
  const entityIndexByEntry = new Uint32Array(entryCount);
  const channelIndexByEntry = new Uint32Array(entryCount);

  for (let i = 0; i < entryCount; i++) {
    const base = i * channelMapStride;
    mapData[base + 2] = i * 10;
    mapData[base + 3] = 2;
    entityIndexByEntry[i] = i;
    channelIndexByEntry[i] = i % 2;
  }

  const dummyBuffer = { destroy: () => {} } as any;

  return {
    packedKeyframesBuffer: dummyBuffer,
    keyframeStartTimesBuffer: dummyBuffer,
    keyframeDurationsBuffer: dummyBuffer,
    rawKeyframeData,
    mapData,
    entityIndexByEntry,
    channelIndexByEntry,
    channelMapsBuffer: dummyBuffer,
    entityIndexByEntryBuffer: dummyBuffer,
    channelIndexByEntryBuffer: dummyBuffer,
  } as unknown as any;
}

describe('Keyframe GPUBuffer reuse', () => {
  beforeEach(() => {
    (globalThis as any).GPUBufferUsage = {
      COPY_SRC: 0x0004,
      COPY_DST: 0x0008,
      STORAGE: 0x0080,
      UNIFORM: 0x0040,
      MAP_READ: 0x0001,
    };
  });

  it('reuses keyframe search buffers per archetype', async () => {
    const { device, getCreateBufferCalls } = createMockDevice();
    const persistent = new PersistentGPUBufferManager(device);

    const preprocess = createPreprocess(4, RAW_KEYFRAME_STRIDE, CHANNEL_MAP_STRIDE);
    const statesData = new Float32Array(4 * 4);
    statesData[1] = 1;
    statesData[2] = 1;

    const res1 = await runKeyframeSearchPass(
      device,
      device.queue,
      'a',
      preprocess,
      statesData,
      2,
      false,
      persistent,
    );
    expect(res1).not.toBeNull();
    const createdAfterFirst = getCreateBufferCalls();

    statesData[1] = 2;
    const res2 = await runKeyframeSearchPass(
      device,
      device.queue,
      'a',
      preprocess,
      statesData,
      2,
      false,
      persistent,
    );
    expect(res2).not.toBeNull();
    expect(getCreateBufferCalls()).toBe(createdAfterFirst);
    expect(res2!.searchResultsBufferPersistent).toBe(true);
  });

  it('isolates keyframe search buffers across archetypes', async () => {
    const { device, getCreateBufferCalls } = createMockDevice();
    const persistent = new PersistentGPUBufferManager(device);

    const preprocess = createPreprocess(4, RAW_KEYFRAME_STRIDE, CHANNEL_MAP_STRIDE);
    const statesData = new Float32Array(4 * 4);
    statesData[1] = 1;
    statesData[2] = 1;

    const resA = await runKeyframeSearchPass(
      device,
      device.queue,
      'a',
      preprocess,
      statesData,
      2,
      false,
      persistent,
    );
    const createdAfterA = getCreateBufferCalls();
    const resB = await runKeyframeSearchPass(
      device,
      device.queue,
      'b',
      preprocess,
      statesData,
      2,
      false,
      persistent,
    );

    expect(resA).not.toBeNull();
    expect(resB).not.toBeNull();
    expect(getCreateBufferCalls()).toBeGreaterThan(createdAfterA);
    expect(resA!.searchResultsBuffer).not.toBe(resB!.searchResultsBuffer);
  });

  it('grows keyframe search buffers when entryCount increases', async () => {
    const { device, getCreateBufferCalls } = createMockDevice();
    const persistent = new PersistentGPUBufferManager(device);

    const statesData = new Float32Array(4096 * 4);
    statesData[1] = 1;
    statesData[2] = 1;

    const small = createPreprocess(4, RAW_KEYFRAME_STRIDE, CHANNEL_MAP_STRIDE);
    const big = createPreprocess(2048, RAW_KEYFRAME_STRIDE, CHANNEL_MAP_STRIDE);

    const res1 = await runKeyframeSearchPass(
      device,
      device.queue,
      'a',
      small,
      statesData,
      2,
      false,
      persistent,
    );
    expect(res1).not.toBeNull();
    const createdAfterSmall = getCreateBufferCalls();

    const res2 = await runKeyframeSearchPass(
      device,
      device.queue,
      'a',
      big,
      statesData,
      2,
      false,
      persistent,
    );
    expect(res2).not.toBeNull();
    expect(getCreateBufferCalls()).toBeGreaterThan(createdAfterSmall);
    expect(res1!.searchResultsBuffer).not.toBe(res2!.searchResultsBuffer);
  });

  it('reuses keyframe interp outputIndices buffer per archetype', async () => {
    const { device, getCreateBufferCalls } = createMockDevice();
    const persistent = new PersistentGPUBufferManager(device);

    const preprocess = createPreprocess(4, RAW_KEYFRAME_STRIDE, CHANNEL_MAP_STRIDE);
    (preprocess as any).channelMapsBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessMaps:a',
      preprocess.mapData,
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'maps-a', allowGrowth: true, contentVersion: 1 },
    );
    (preprocess as any).entityIndexByEntryBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessEntityIndexByEntry:a',
      preprocess.entityIndexByEntry,
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'entity-idx-a', allowGrowth: true, contentVersion: 1 },
    );
    (preprocess as any).channelIndexByEntryBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessChannelIndexByEntry:a',
      preprocess.channelIndexByEntry,
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'channel-idx-a', allowGrowth: true, contentVersion: 1 },
    );
    (preprocess as any).keyframeStartTimesBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessStartTimes:a',
      new Float32Array([0]),
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'start-times-a', allowGrowth: true, contentVersion: 1 },
    );
    (preprocess as any).keyframeDurationsBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessDurations:a',
      new Float32Array([0]),
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'durations-a', allowGrowth: true, contentVersion: 1 },
    );
    const statesData = new Float32Array(4 * 4);
    statesData[1] = 1;
    statesData[2] = 1;

    const out1 = await runKeyframeInterpPass(
      device,
      device.queue,
      'a',
      preprocess,
      statesData,
      2,
      4,
      false,
      persistent,
    );
    expect(out1).not.toBeNull();
    const createdAfterFirst = getCreateBufferCalls();

    const out2 = await runKeyframeInterpPass(
      device,
      device.queue,
      'a',
      preprocess,
      statesData,
      2,
      4,
      false,
      persistent,
    );
    expect(out2).not.toBeNull();
    expect(getCreateBufferCalls()).toBe(createdAfterFirst + 1);
  });

  it('uses GPU entry expansion and returns outputIndicesBuffer', async () => {
    const { device, getWriteBufferCalls } = createMockDevice();
    const persistent = new PersistentGPUBufferManager(device);

    const preprocess = createPreprocess(4, RAW_KEYFRAME_STRIDE, CHANNEL_MAP_STRIDE) as any;
    preprocess.channelMapsBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessMaps:a',
      preprocess.mapData,
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'maps-a', allowGrowth: true, contentVersion: 1 },
    );
    preprocess.entityIndexByEntryBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessEntityIndexByEntry:a',
      preprocess.entityIndexByEntry,
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'entity-idx-a', allowGrowth: true, contentVersion: 1 },
    );
    preprocess.channelIndexByEntryBuffer = persistent.getOrCreateBuffer(
      'keyframePreprocessChannelIndexByEntry:a',
      preprocess.channelIndexByEntry,
      ((globalThis as any).GPUBufferUsage.STORAGE |
        (globalThis as any).GPUBufferUsage.COPY_DST) as any,
      { label: 'channel-idx-a', allowGrowth: true, contentVersion: 1 },
    );

    const statesData = new Float32Array(4 * 4);
    statesData[1] = 1;
    statesData[2] = 1;

    const res1 = await runKeyframeSearchPass(
      device,
      device.queue,
      'a',
      preprocess,
      statesData,
      2,
      false,
      persistent,
      undefined,
      {
        entryExpansionOnGPUEnabled: true,
      },
    );
    expect(res1).not.toBeNull();
    expect(res1!.outputIndicesBuffer).toBeTruthy();

    const writesAfterFirst = getWriteBufferCalls();

    statesData[1] = 2;
    const res2 = await runKeyframeSearchPass(
      device,
      device.queue,
      'a',
      preprocess,
      statesData,
      2,
      false,
      persistent,
      undefined,
      {
        entryExpansionOnGPUEnabled: true,
      },
    );
    expect(res2).not.toBeNull();
    expect(getWriteBufferCalls()).toBeGreaterThan(writesAfterFirst);
  });
});

describe('StagingBufferPool buffer→entry mapping', () => {
  it('marks in-flight and available without scanning pools', () => {
    const device = {
      createBuffer: vi.fn(() => ({ destroy: vi.fn() }) as any),
    } as any;

    const sp = new StagingBufferPool(device);
    const stagingBuffer = sp.acquire('arch', 64) as any;
    expect(stagingBuffer).toBeTruthy();

    const entry = (sp as any).entryByBuffer.get(stagingBuffer);
    expect(entry).toBeTruthy();
    expect(entry.isInFlight).toBe(false);

    const originalPools = (sp as any).pools;
    (sp as any).pools = {
      values: () => {
        throw new Error('pool scan');
      },
    };

    sp.markInFlight(stagingBuffer);
    expect(entry.isInFlight).toBe(true);
    sp.markAvailable(stagingBuffer);
    expect(entry.isInFlight).toBe(false);

    (sp as any).pools = originalPools;
  });
});

describe('Keyframe preprocess clip sharing model', () => {
  beforeEach(() => {
    (globalThis as any).GPUBufferUsage = {
      COPY_SRC: 0x0004,
      COPY_DST: 0x0008,
      STORAGE: 0x0080,
      UNIFORM: 0x0040,
      MAP_READ: 0x0001,
    };
  });

  it('packs raw keyframes once per clip and maps instances to shared offsets', async () => {
    const { device } = createMockDevice();

    const clip0Raw = new Float32Array(RAW_KEYFRAME_STRIDE * 2);
    const clip1Raw = new Float32Array(RAW_KEYFRAME_STRIDE * 1);
    const clip0Maps = new Uint32Array([1, 0, 0, 2]);
    const clip1Maps = new Uint32Array([1, 0, 0, 1]);

    const clipIndexByEntity = new Uint32Array([0, 0, 1]);

    const res = await runKeyframePreprocessPass(device, device.queue, {
      archetypeId: 'arch',
      keyframesVersion: 1,
      preprocessedKeyframes: {
        rawKeyframesPerEntity: [clip0Raw, clip0Raw, clip1Raw],
        channelMapPerEntity: [clip0Maps, clip0Maps, clip1Maps],
        clipModel: {
          rawKeyframesByClip: [clip0Raw, clip1Raw],
          channelMapByClip: [clip0Maps, clip1Maps],
          clipIndexByEntity,
        },
      },
    });

    expect(res).not.toBeNull();
    expect(res!.rawKeyframeData.length).toBe(clip0Raw.length + clip1Raw.length);
    expect(res!.mapData.length).toBe(CHANNEL_MAP_STRIDE * 3);

    const clip0KeyframeCount = clip0Raw.length / RAW_KEYFRAME_STRIDE;
    expect(res!.mapData[2]).toBe(0);
    expect(res!.mapData[CHANNEL_MAP_STRIDE + 2]).toBe(0);
    expect(res!.mapData[2 * CHANNEL_MAP_STRIDE + 2]).toBe(clip0KeyframeCount);
  });
});
