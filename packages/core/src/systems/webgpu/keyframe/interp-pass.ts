/**
 * Keyframe Interpolation Pass
 *
 * GPU compute pass to interpolate animation values from keyframe search results.
 * Takes active keyframe indices and computes interpolated values for each
 * entity/channel combination.
 */

import { getKeyframeInterpPipeline, keyframeInterpBindGroupLayout } from './pipelines';

export async function runKeyframeInterpPass(
  device: GPUDevice,
  queue: GPUQueue,
  packedKeyframesBuffer: GPUBuffer,
  searchResultsBuffer: GPUBuffer,
  outputIndicesData: Uint32Array,
  entryCount: number,
  entityCount: number,
  channelCount: number,
  archetypeId: string,
): Promise<GPUBuffer | null> {
  if (!entryCount || !entityCount || !channelCount) {
    packedKeyframesBuffer.destroy();
    searchResultsBuffer.destroy();
    return null;
  }

  const outputIndicesBuffer = device.createBuffer({
    size: outputIndicesData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-keyframe-interp-output-indices-${archetypeId}`,
  });

  const outputsSize = entityCount * channelCount * 4;
  const outputBuffer = device.createBuffer({
    size: outputsSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-keyframe-interp-outputs-${archetypeId}`,
  });

  queue.writeBuffer(
    outputIndicesBuffer,
    0,
    outputIndicesData.buffer as ArrayBuffer,
    0,
    outputIndicesData.byteLength,
  );

  const pipeline = await getKeyframeInterpPipeline(device);
  if (!pipeline || !keyframeInterpBindGroupLayout) {
    searchResultsBuffer.destroy();
    outputIndicesBuffer.destroy();
    outputBuffer.destroy();
    return null;
  }

  const bindGroupLayout = keyframeInterpBindGroupLayout;
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: packedKeyframesBuffer } },
      { binding: 1, resource: { buffer: searchResultsBuffer } },
      { binding: 2, resource: { buffer: outputIndicesBuffer } },
      { binding: 3, resource: { buffer: outputBuffer } },
    ],
  });

  const cmdEncoder = device.createCommandEncoder({
    label: `motion-keyframe-interp-encoder-${archetypeId}`,
  });
  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupsX = Math.ceil(entryCount / 64);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();
  queue.submit([cmdEncoder.finish()]);

  searchResultsBuffer.destroy();
  outputIndicesBuffer.destroy();

  return outputBuffer;
}
