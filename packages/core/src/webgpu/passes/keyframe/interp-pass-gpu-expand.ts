import { getErrorHandler } from '../../../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../../../errors';
import { getPersistentGPUBufferManager } from '../../../webgpu/persistent-buffer-manager';
import {
  acquirePooledOutputBuffer,
  releasePooledOutputBuffer,
} from '../../../webgpu/output-buffer-pool';
import {
  getKeyframeEntryExpandPipeline,
  getKeyframeInterpPipeline,
  getKeyframeSearchWindowPipeline,
  keyframeEntryExpandBindGroupLayout,
  keyframeInterpBindGroupLayout,
  keyframeSearchWindowBindGroupLayout,
} from './pipelines';
import type { KeyframePreprocessResult } from './types';
import type { WebGPUFrameEncoder } from '../../../webgpu/command-encoder';

const s_keyframeEntryExpandParams = new Uint32Array(4);
const s_keyframeSearchInterpParams = new Uint32Array(4);

export async function recordKeyframeSearchWindowPass(params: {
  device: GPUDevice;
  entryCount: number;
  preprocess: KeyframePreprocessResult;
  searchTimesBuffer: GPUBuffer;
  keyframeOffsetsBuffer: GPUBuffer;
  keyframeCountsBuffer: GPUBuffer;
  cmdEncoder?: GPUCommandEncoder;
  pass?: GPUComputePassEncoder;
}): Promise<boolean> {
  const {
    device,
    entryCount,
    preprocess,
    searchTimesBuffer,
    keyframeOffsetsBuffer,
    keyframeCountsBuffer,
    cmdEncoder,
    pass,
  } = params;
  if (
    !preprocess.channelMapsBuffer ||
    !preprocess.blockStartOffsetsBuffer ||
    !preprocess.blockStartTimesBuffer
  ) {
    return false;
  }
  const pipeline = await getKeyframeSearchWindowPipeline(device);
  if (!pipeline || !keyframeSearchWindowBindGroupLayout) {
    return false;
  }
  const bindGroup = device.createBindGroup({
    layout: keyframeSearchWindowBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: preprocess.channelMapsBuffer } },
      { binding: 1, resource: { buffer: searchTimesBuffer } },
      { binding: 2, resource: { buffer: preprocess.blockStartOffsetsBuffer } },
      { binding: 3, resource: { buffer: preprocess.blockStartTimesBuffer } },
      { binding: 4, resource: { buffer: keyframeOffsetsBuffer } },
      { binding: 5, resource: { buffer: keyframeCountsBuffer } },
    ],
  });
  if (pass) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);
    return true;
  }
  if (cmdEncoder) {
    const p = cmdEncoder.beginComputePass();
    p.setPipeline(pipeline);
    p.setBindGroup(0, bindGroup);
    p.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);
    p.end();
    return true;
  }
  return true;
}

export async function tryRunKeyframeInterpPassWithGpuEntryExpand(params: {
  device: GPUDevice;
  queue: GPUQueue;
  archetypeId: string;
  preprocess: KeyframePreprocessResult;
  statesData: Float32Array;
  channelCount: number;
  entityCount: number;
  entryCount: number;
  useOptimizedSearch: boolean;
  indexedSearchEnabled: boolean;
  persistentOverride?: ReturnType<typeof getPersistentGPUBufferManager>;
  frame?: WebGPUFrameEncoder;
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void;
  options?: {
    reuseOutputBuffer?: boolean;
    statesVersion?: number;
    statesConditionalUploadEnabled?: boolean;
    forceStatesUploadEnabled?: boolean;
  };
}): Promise<{ outputBuffer: GPUBuffer; outputBufferTag?: unknown } | null> {
  const {
    device,
    queue,
    archetypeId,
    preprocess,
    statesData,
    channelCount,
    entityCount,
    entryCount,
    useOptimizedSearch,
    indexedSearchEnabled,
    persistentOverride,
    frame,
    submit,
    options,
  } = params;

  if (
    !preprocess.channelMapsBuffer ||
    !preprocess.entityIndexByEntryBuffer ||
    !preprocess.channelIndexByEntryBuffer
  ) {
    return null;
  }

  try {
    const persistent = persistentOverride ?? getPersistentGPUBufferManager(device);

    const statesConditionalUploadEnabled = options?.statesConditionalUploadEnabled === true;
    const forceStatesUploadEnabled = options?.forceStatesUploadEnabled === true;
    const statesContentVersion =
      statesConditionalUploadEnabled && typeof options?.statesVersion === 'number'
        ? options.statesVersion
        : undefined;
    const shouldForceUploadStates = forceStatesUploadEnabled || !statesConditionalUploadEnabled;

    const statesBuffer = persistent.getOrCreateBuffer(
      `states:${archetypeId}`,
      statesData,
      (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
      {
        label: `state-${archetypeId}`,
        allowGrowth: true,
        skipChangeDetection: shouldForceUploadStates,
        contentVersion: statesContentVersion,
        forceUpdate: forceStatesUploadEnabled,
      },
    );

    const searchTimesBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeSearchTimesGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-search-times-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    const keyframeOffsetsBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeSearchOffsetsGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-search-offsets-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    const keyframeCountsBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeSearchCountsGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-search-counts-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    const outputIndicesBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeInterpOutputIndicesGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-interp-output-indices-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    s_keyframeEntryExpandParams[0] = channelCount >>> 0;
    s_keyframeEntryExpandParams[1] = 0;
    s_keyframeEntryExpandParams[2] = 0;
    s_keyframeEntryExpandParams[3] = 0;

    const entryExpandParamsBuffer = persistent.getOrCreateBuffer(
      `keyframeEntryExpandParams:${archetypeId}`,
      s_keyframeEntryExpandParams,
      (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
      {
        label: `motion-keyframe-entry-expand-params-${archetypeId}`,
        skipChangeDetection: true,
      },
    );

    s_keyframeSearchInterpParams[0] = useOptimizedSearch ? 1 : 0;
    s_keyframeSearchInterpParams[1] = 0;
    s_keyframeSearchInterpParams[2] = 0;
    s_keyframeSearchInterpParams[3] = 0;

    const searchInterpParamsBuffer = persistent.getOrCreateBuffer(
      `keyframeSearchInterpParams:${archetypeId}`,
      s_keyframeSearchInterpParams,
      (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
      {
        label: `motion-keyframe-search-interp-params-${archetypeId}`,
        skipChangeDetection: false,
      },
    );

    const outputsSize = entityCount * channelCount * 4;
    const reuseOutputBuffer = options?.reuseOutputBuffer === true;
    const outputBufferRes = reuseOutputBuffer
      ? acquirePooledOutputBuffer({
          device,
          archetypeId,
          requestedByteSize: outputsSize,
          usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
          label: `motion-keyframe-interp-outputs-${archetypeId}`,
        })
      : null;
    const outputBuffer =
      outputBufferRes?.buffer ??
      device.createBuffer({
        size: outputsSize,
        usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
        mappedAtCreation: false,
        label: `motion-keyframe-interp-outputs-${archetypeId}`,
      });

    const entryExpandPipeline = await getKeyframeEntryExpandPipeline(device);
    const interpPipeline = await getKeyframeInterpPipeline(device);
    if (
      !entryExpandPipeline ||
      !keyframeEntryExpandBindGroupLayout ||
      !interpPipeline ||
      !keyframeInterpBindGroupLayout
    ) {
      if (outputBufferRes) {
        releasePooledOutputBuffer(outputBuffer);
      } else {
        outputBuffer.destroy();
      }
      return null;
    }

    const entryExpandBindGroup = device.createBindGroup({
      layout: keyframeEntryExpandBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: statesBuffer } },
        { binding: 1, resource: { buffer: preprocess.channelMapsBuffer } },
        { binding: 2, resource: { buffer: preprocess.entityIndexByEntryBuffer } },
        { binding: 3, resource: { buffer: preprocess.channelIndexByEntryBuffer } },
        { binding: 4, resource: { buffer: entryExpandParamsBuffer } },
        { binding: 5, resource: { buffer: searchTimesBuffer } },
        { binding: 6, resource: { buffer: keyframeOffsetsBuffer } },
        { binding: 7, resource: { buffer: keyframeCountsBuffer } },
        { binding: 8, resource: { buffer: outputIndicesBuffer } },
      ],
    });

    const interpBindGroup = device.createBindGroup({
      layout: keyframeInterpBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: preprocess.packedKeyframesBuffer } },
        { binding: 1, resource: { buffer: preprocess.keyframeStartTimesBuffer } },
        { binding: 2, resource: { buffer: preprocess.keyframeDurationsBuffer } },
        { binding: 3, resource: { buffer: searchTimesBuffer } },
        { binding: 4, resource: { buffer: keyframeOffsetsBuffer } },
        { binding: 5, resource: { buffer: keyframeCountsBuffer } },
        { binding: 6, resource: { buffer: outputIndicesBuffer } },
        { binding: 7, resource: { buffer: outputBuffer } },
        { binding: 8, resource: { buffer: searchInterpParamsBuffer } },
      ],
    });

    if (frame) {
      const pass = frame.beginComputePass();

      pass.setPipeline(entryExpandPipeline);
      pass.setBindGroup(0, entryExpandBindGroup);
      pass.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);

      if (
        indexedSearchEnabled &&
        !(await recordKeyframeSearchWindowPass({
          device,
          entryCount,
          preprocess,
          searchTimesBuffer,
          keyframeOffsetsBuffer,
          keyframeCountsBuffer,
          pass,
        }))
      ) {
        if (outputBufferRes) {
          releasePooledOutputBuffer(outputBuffer);
        } else {
          outputBuffer.destroy();
        }
        return null;
      }

      pass.setPipeline(interpPipeline);
      pass.setBindGroup(0, interpBindGroup);
      pass.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);

      return { outputBuffer, outputBufferTag: outputBufferRes?.tag };
    }

    const cmdEncoder = device.createCommandEncoder({
      label: `motion-keyframe-search-interp-encoder-${archetypeId}`,
    });

    {
      const pass = cmdEncoder.beginComputePass();
      pass.setPipeline(entryExpandPipeline);
      pass.setBindGroup(0, entryExpandBindGroup);
      const workgroupsX = Math.ceil(entryCount / 64);
      pass.dispatchWorkgroups(workgroupsX, 1, 1);
      pass.end();
    }

    if (
      indexedSearchEnabled &&
      !(await recordKeyframeSearchWindowPass({
        device,
        cmdEncoder,
        entryCount,
        preprocess,
        searchTimesBuffer,
        keyframeOffsetsBuffer,
        keyframeCountsBuffer,
      }))
    ) {
      if (outputBufferRes) {
        releasePooledOutputBuffer(outputBuffer);
      } else {
        outputBuffer.destroy();
      }
      return null;
    }

    {
      const pass = cmdEncoder.beginComputePass();
      pass.setPipeline(interpPipeline);
      pass.setBindGroup(0, interpBindGroup);
      const workgroupsX = Math.ceil(entryCount / 64);
      pass.dispatchWorkgroups(workgroupsX, 1, 1);
      pass.end();
    }

    const commandBuffer = cmdEncoder.finish();
    if (submit) {
      submit(commandBuffer);
    } else {
      queue.submit([commandBuffer]);
    }

    return { outputBuffer, outputBufferTag: outputBufferRes?.tag };
  } catch (error) {
    const errorHandler = getErrorHandler();
    const originalError = error instanceof Error ? error.message : String(error);
    errorHandler.handle(
      new MotionError(
        'Keyframe interpolation pass failed.',
        ErrorCode.GPU_PIPELINE_FAILED,
        ErrorSeverity.ERROR,
        {
          archetypeId,
          entryCount,
          entityCount,
          channelCount,
          indexedSearchEnabled,
          originalError,
        },
      ),
    );
    return null;
  }
}
