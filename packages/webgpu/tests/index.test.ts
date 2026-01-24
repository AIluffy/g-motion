import { describe, expect, it } from 'vitest';
import { PipelineManager } from '../src/pipeline-manager';
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
