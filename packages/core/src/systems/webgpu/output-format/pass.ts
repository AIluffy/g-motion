/**
 * Output Format Pass
 *
 * GPU compute pass to format raw GPU output values into final output format.
 * Handles color encoding, value clamping, and format conversion.
 */

import type { ChannelMapping } from '../../../webgpu/channel-mapping';
import { isStandardTransformChannels } from '../../../webgpu/channel-mapping';
import {
  createStandardChannelMapping,
  OUTPUT_FORMAT,
  packOutputChannels,
} from '../../../webgpu/output-format-shader';
import { outputFormatBufferPool, trackBuffer } from './buffer-pool';
import { getOutputFormatPipeline, outputFormatBindGroupLayout } from './pipeline';
import { resetOutputFormatPassState } from './pipeline';
import { makeChannelsKey } from './types';
import type { WebGPUFrameEncoder } from '../frame-encoder';

let outputFormatPassEnabled = true;

let channelsBufferCache = new WeakMap<GPUDevice, Map<string, GPUBuffer>>();
let paramsBufferCache = new WeakMap<GPUDevice, GPUBuffer>();
const trackedBuffers: GPUBuffer[] = [];

export function enableGPUOutputFormatPass(): void {
  outputFormatPassEnabled = true;
}

export function disableGPUOutputFormatPass(): void {
  outputFormatPassEnabled = false;
}

export function __resetOutputFormatPassForTests(): void {
  resetOutputFormatPassState();
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
  frame?: WebGPUFrameEncoder,
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void,
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

  const bindGroup = device.createBindGroup({
    layout: outputFormatBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: rawOutputBuffer } },
      { binding: 1, resource: { buffer: channelsBuffer } },
      { binding: 2, resource: { buffer: formattedBuffer } },
      { binding: 3, resource: { buffer: paramsBuffer } },
    ],
  });

  const workgroupSize = 64;
  const workgroupsX = Math.ceil(usedOutputValueCount / workgroupSize);

  if (frame) {
    const pass = frame.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupsX, 1, 1);
    return formattedBuffer;
  }

  const cmdEncoder = device.createCommandEncoder({
    label: `motion-output-format-encoder-${archetypeId}`,
  });

  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();

  const commandBuffer = cmdEncoder.finish();
  if (submit) {
    submit(commandBuffer);
  } else {
    queue.submit([commandBuffer]);
  }
  return formattedBuffer;
}

export function releaseOutputFormatBuffer(buffer: GPUBuffer, queue: GPUQueue): void {
  void outputFormatBufferPool.release(buffer, queue);
}

export function getOutputFormatBufferPoolStats(device: GPUDevice) {
  return outputFormatBufferPool.getStatsForTests(device);
}

export function __getOutputFormatBufferPoolStatsForTests(device: GPUDevice) {
  return getOutputFormatBufferPoolStats(device);
}
