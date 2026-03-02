import { describe, expect, it } from 'vitest';
import { AdaptiveWorkgroupSelector, PipelineManager } from '../src/pipeline-manager';
import { PersistentGPUBufferManager } from '../src/persistent-buffer-manager';
import { WebGPUConstants } from '@g-motion/shared';
import {
  clearViewportCullingPipelineCache,
  getCullingCompactPipeline,
} from '../src/passes/viewport/culling-pipeline';
import {
  clearKeyframePipelineCache,
  getKeyframeInterpPipeline,
} from '../src/passes/keyframe/pipelines';
import {
  clearOutputFormatPipelineCache,
  getOutputFormatPipeline,
} from '../src/output-format/pipeline';

type MockDevice = {
  __id: string;
  createShaderModule: (descriptor: any) => unknown;
  createBindGroupLayout: (descriptor: any) => unknown;
  createPipelineLayout: (descriptor: any) => unknown;
  createComputePipeline: (descriptor: any) => unknown;
};

function createMockDevice(id: string): MockDevice {
  const device = {
    __id: id,
    createShaderModule: (descriptor: any) => ({ descriptor, id }),
    createBindGroupLayout: (descriptor: any) => ({ descriptor, id }),
    createPipelineLayout: (descriptor: any) => ({ descriptor, id }),
    createComputePipeline: (descriptor: any) => ({ descriptor, id }),
  };
  return device as MockDevice;
}

type MockBuffer = {
  size: number;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
};

function createMockGPUDeviceForBuffers() {
  const mappedRanges: ArrayBuffer[] = [];
  const queue = {
    writeCalls: 0,
    writeBuffer: () => {
      queue.writeCalls += 1;
    },
  };
  const device = {
    queue,
    createBuffer: (descriptor: { size: number }) => {
      const range = new ArrayBuffer(descriptor.size);
      mappedRanges.push(range);
      const buffer: MockBuffer = {
        size: descriptor.size,
        getMappedRange: () => range,
        unmap: () => {},
        destroy: () => {},
      };
      return buffer as unknown as { size: number };
    },
  };
  return { device, queue };
}

function ensureGPUBufferUsageMock() {
  if (!(globalThis as any).GPUBufferUsage) {
    (globalThis as any).GPUBufferUsage = { COPY_DST: 1 };
  }
}

describe('WebGPU pipeline cache device scoping', () => {
  it('隔离不同 device 的 workgroup pipeline 缓存', async () => {
    const manager = new PipelineManager();
    const deviceA = createMockDevice('a');
    const deviceB = createMockDevice('b');
    const pipelineA = { id: 'pipeline-a' } as any;
    const pipelineB = { id: 'pipeline-b' } as any;

    manager.cachePipeline(deviceA, 64, pipelineA, 'interp');
    manager.cachePipeline(deviceB, 64, pipelineB, 'interp');

    const cachedA = await manager.getPipelineForWorkgroup(deviceA, 64, 'interp');
    const cachedB = await manager.getPipelineForWorkgroup(deviceB, 64, 'interp');

    expect(cachedA).toBe(pipelineA);
    expect(cachedB).toBe(pipelineB);
  });

  it('仅清理指定 device 的 pipeline 缓存', async () => {
    const manager = new PipelineManager();
    const deviceA = createMockDevice('a');
    const deviceB = createMockDevice('b');
    const pipelineA = { id: 'pipeline-a' } as any;
    const pipelineB = { id: 'pipeline-b' } as any;

    manager.cachePipeline(deviceA, 64, pipelineA, 'interp');
    manager.cachePipeline(deviceB, 64, pipelineB, 'interp');
    manager.clearPipelineCache(deviceA);

    const cachedA = await manager.getPipelineForWorkgroup(deviceA, 64, 'interp');
    const cachedB = await manager.getPipelineForWorkgroup(deviceB, 64, 'interp');

    expect(cachedA).toBeNull();
    expect(cachedB).toBe(pipelineB);
  });
});

describe('AdaptiveWorkgroupSelector behavior', () => {
  const { WORKGROUP } = WebGPUConstants;

  it('场景 A: 少量实体收敛到小工作组', () => {
    const selector = new AdaptiveWorkgroupSelector({ minSamples: 2 });
    const archetypeId = 'a';
    const entityCount = 50;

    const durationFor = (size: number) => {
      if (size === WORKGROUP.SIZE_SMALL) return 0.4;
      if (size === WORKGROUP.SIZE_MEDIUM) return 0.45;
      if (size === WORKGROUP.SIZE_DEFAULT) return 0.7;
      return 1.1;
    };

    let selected = selector.select(archetypeId, entityCount);
    for (let i = 0; i < 16; i++) {
      selector.recordTiming(archetypeId, selected, durationFor(selected));
      selected = selector.select(archetypeId, entityCount);
    }

    expect([WORKGROUP.SIZE_SMALL, WORKGROUP.SIZE_MEDIUM]).toContain(selected);
  });

  it('场景 B: 大量实体收敛到最大工作组', () => {
    const selector = new AdaptiveWorkgroupSelector({ minSamples: 2 });
    const archetypeId = 'b';
    const entityCount = 10000;

    const durationFor = (size: number) => {
      if (size === WORKGROUP.SIZE_XLARGE) return 1.2;
      if (size === WORKGROUP.SIZE_DEFAULT) return 1.6;
      if (size === WORKGROUP.SIZE_MEDIUM) return 2.1;
      return 2.6;
    };

    let selected = selector.select(archetypeId, entityCount);
    for (let i = 0; i < 20; i++) {
      selector.recordTiming(archetypeId, selected, durationFor(selected));
      selected = selector.select(archetypeId, entityCount);
    }

    expect(selected).toBe(WORKGROUP.SIZE_XLARGE);
  });

  it('场景 C: 中等实体但偏好小工作组', () => {
    const selector = new AdaptiveWorkgroupSelector({ minSamples: 2 });
    const archetypeId = 'c';
    const entityCount = 600;

    const durationFor = (size: number) => {
      if (size === WORKGROUP.SIZE_MEDIUM) return 0.9;
      if (size === WORKGROUP.SIZE_SMALL) return 1.0;
      if (size === WORKGROUP.SIZE_DEFAULT) return 1.4;
      return 1.8;
    };

    let selected = selector.select(archetypeId, entityCount);
    for (let i = 0; i < 20; i++) {
      selector.recordTiming(archetypeId, selected, durationFor(selected));
      selected = selector.select(archetypeId, entityCount);
    }

    expect(selected).toBe(WORKGROUP.SIZE_MEDIUM);
  });
});

describe('PersistentGPUBufferManager uploadIfChanged version hint', () => {
  it('版本号一致时跳过内容检查与上传', () => {
    ensureGPUBufferUsageMock();
    const { device, queue } = createMockGPUDeviceForBuffers();
    const manager = new PersistentGPUBufferManager(device);
    const data = new Float32Array([1, 2, 3, 4]);

    manager.uploadIfChanged('states:a', data, 1, { versionHint: 1 });
    manager.uploadIfChanged('states:a', data, 1, { versionHint: 1 });

    expect(queue.writeCalls).toBe(0);
  });

  it('版本号变化但内容一致时跳过上传', () => {
    ensureGPUBufferUsageMock();
    const { device, queue } = createMockGPUDeviceForBuffers();
    const manager = new PersistentGPUBufferManager(device);
    const data = new Float32Array([5, 6, 7, 8]);

    manager.uploadIfChanged('states:b', data, 1, { versionHint: 1 });
    manager.uploadIfChanged('states:b', data, 1, { versionHint: 2 });

    expect(queue.writeCalls).toBe(0);
  });

  it('版本号变化且内容变化时执行上传', () => {
    ensureGPUBufferUsageMock();
    const { device, queue } = createMockGPUDeviceForBuffers();
    const manager = new PersistentGPUBufferManager(device);
    const dataA = new Float32Array([9, 10, 11, 12]);
    const dataB = new Float32Array([9, 10, 11, 13]);

    manager.uploadIfChanged('states:c', dataA, 1, { versionHint: 1 });
    manager.uploadIfChanged('states:c', dataB, 1, { versionHint: 2 });

    expect(queue.writeCalls).toBe(1);
  });
});

describe('WebGPU pass pipelines cache per device', () => {
  it('输出格式化 pipeline 按 device 缓存', async () => {
    const deviceA = createMockDevice('a');
    const deviceB = createMockDevice('b');

    const stateA1 = await getOutputFormatPipeline(deviceA);
    const stateA2 = await getOutputFormatPipeline(deviceA);
    const stateB = await getOutputFormatPipeline(deviceB);

    expect(stateA1?.pipeline).toBe(stateA2?.pipeline);
    expect(stateA1?.pipeline).not.toBe(stateB?.pipeline);
  });

  it('输出格式化 pipeline 支持按 device 清理', async () => {
    const deviceA = createMockDevice('a');
    const deviceB = createMockDevice('b');

    const stateA1 = await getOutputFormatPipeline(deviceA);
    const stateB1 = await getOutputFormatPipeline(deviceB);
    clearOutputFormatPipelineCache(deviceA);
    const stateA2 = await getOutputFormatPipeline(deviceA);
    const stateB2 = await getOutputFormatPipeline(deviceB);

    expect(stateA1?.pipeline).not.toBe(stateA2?.pipeline);
    expect(stateB1?.pipeline).toBe(stateB2?.pipeline);
  });

  it('视口裁剪 pipeline 按 device 缓存', async () => {
    const deviceA = createMockDevice('a');
    const deviceB = createMockDevice('b');

    const stateA1 = await getCullingCompactPipeline(deviceA);
    const stateA2 = await getCullingCompactPipeline(deviceA);
    const stateB = await getCullingCompactPipeline(deviceB);

    expect(stateA1?.pipeline).toBe(stateA2?.pipeline);
    expect(stateA1?.pipeline).not.toBe(stateB?.pipeline);
  });

  it('视口裁剪 pipeline 支持按 device 清理', async () => {
    const deviceA = createMockDevice('a');
    const deviceB = createMockDevice('b');

    const stateA1 = await getCullingCompactPipeline(deviceA);
    const stateB1 = await getCullingCompactPipeline(deviceB);
    clearViewportCullingPipelineCache(deviceA);
    const stateA2 = await getCullingCompactPipeline(deviceA);
    const stateB2 = await getCullingCompactPipeline(deviceB);

    expect(stateA1?.pipeline).not.toBe(stateA2?.pipeline);
    expect(stateB1?.pipeline).toBe(stateB2?.pipeline);
  });
});

describe('WebGPU keyframe pipelines cache per device', () => {
  it('关键帧 pipeline 支持按 device 清理', async () => {
    const deviceA = createMockDevice('a');
    const deviceB = createMockDevice('b');

    const stateA1 = await getKeyframeInterpPipeline(deviceA);
    const stateB1 = await getKeyframeInterpPipeline(deviceB);
    clearKeyframePipelineCache(deviceA);
    const stateA2 = await getKeyframeInterpPipeline(deviceA);
    const stateB2 = await getKeyframeInterpPipeline(deviceB);

    expect(stateA1?.pipeline).not.toBe(stateA2?.pipeline);
    expect(stateB1?.pipeline).toBe(stateB2?.pipeline);
  });
});
