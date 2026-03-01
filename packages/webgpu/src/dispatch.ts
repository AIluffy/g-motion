import type { GPUBatchDescriptor } from './types';
import type { WebGPUFrameEncoder } from './command-encoder';
import { getGPUMetricsProvider } from './metrics-provider';
import type { OutputBufferReadbackTag } from './output-buffer-pool';
import { acquirePooledOutputBuffer } from './output-buffer-pool';
import { getPersistentGPUBufferManager } from './persistent-buffer-manager';
import { getPipelineForWorkgroup, selectWorkgroupSize } from './pipeline';
import type { TimingHelper, TimingToken } from './timing-helper';
export { dispatchPhysicsBatch } from './passes/physics/dispatch-pass';

export async function dispatchGPUBatch(
  device: GPUDevice,
  queue: GPUQueue,
  batch: GPUBatchDescriptor,
  timingHelper: TimingHelper | null,
  archetypeId: string,
  channelCount: number,
  options?: {
    statesConditionalUploadEnabled: boolean;
    forceStatesUploadEnabled: boolean;
    reuseOutputBuffer?: boolean;
  },
  frame?: WebGPUFrameEncoder,
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void,
): Promise<{
  outputBuffer: GPUBuffer;
  outputBufferTag?: OutputBufferReadbackTag;
  entityCount: number;
  archetypeId: string;
}> {
  if (batch.entityCount === 0) {
    throw new Error('dispatchGPUBatch: entityCount must be > 0');
  }

  const bufferManager = getPersistentGPUBufferManager(device);

  const statesConditionalUploadEnabled = options?.statesConditionalUploadEnabled === true;
  const forceStatesUploadEnabled = options?.forceStatesUploadEnabled === true;
  const statesContentVersion =
    statesConditionalUploadEnabled && typeof batch.statesVersion === 'number'
      ? batch.statesVersion
      : undefined;
  const shouldForceUploadStates = forceStatesUploadEnabled || !statesConditionalUploadEnabled;

  const stateGPUBuffer = bufferManager.getOrCreateBuffer(
    `states:${archetypeId}`,
    batch.statesData,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as GPUBufferUsageFlags,
    {
      label: `state-${archetypeId}`,
      allowGrowth: true,
      skipChangeDetection: shouldForceUploadStates,
      contentVersion: statesContentVersion,
      forceUpdate: forceStatesUploadEnabled,
    },
  );

  const keyframeGPUBuffer = bufferManager.getOrCreateBuffer(
    `keyframes:${archetypeId}`,
    batch.keyframesData,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as GPUBufferUsageFlags,
    {
      label: `keyframes-${archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

  const stateBufferSize = (stateGPUBuffer as { size?: number }).size;
  const floatsPerState = 4;
  const bytesPerState = floatsPerState * 4;
  const entityCapacity =
    stateBufferSize && stateBufferSize > 0
      ? Math.max(batch.entityCount, Math.floor(stateBufferSize / bytesPerState))
      : batch.entityCount;

  const outputBytes = entityCapacity * Math.max(channelCount, 1) * 4;
  const outputUsage = (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as GPUBufferUsageFlags;
  const reuseOutputBuffer = options?.reuseOutputBuffer === true;
  let outputBufferTag: OutputBufferReadbackTag | undefined;
  let outputBuffer: GPUBuffer;
  if (reuseOutputBuffer) {
    const acquired = acquirePooledOutputBuffer({
      device,
      archetypeId,
      requestedByteSize: outputBytes,
      usage: outputUsage,
      label: `output-${archetypeId}`,
    });
    outputBuffer = acquired.buffer;
    outputBufferTag = acquired.tag;
  } else {
    outputBuffer = device.createBuffer({
      size: outputBytes,
      usage: outputUsage,
      label: `output-${archetypeId}`,
    });
  }

  const pipeline = await getPipelineForWorkgroup(device, batch.workgroupHint, 'interp');
  if (!pipeline) {
    stateGPUBuffer.destroy();
    keyframeGPUBuffer.destroy();
    outputBuffer.destroy();
    throw new Error(
      `dispatchGPUBatch: failed to get pipeline for workgroup ${batch.workgroupHint}`,
    );
  }

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateGPUBuffer } },
      { binding: 1, resource: { buffer: keyframeGPUBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });

  const workgroupSize = selectWorkgroupSize(batch.workgroupHint);
  const workgroupsX = Math.ceil(batch.entityCount / workgroupSize);

  if (frame) {
    const passEncoder = frame.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(workgroupsX, 1, 1);
    return { outputBuffer, outputBufferTag, entityCount: batch.entityCount, archetypeId };
  }

  const cmdEncoder = device.createCommandEncoder({
    label: `dispatch-${archetypeId}`,
  });

  const passWithTiming: { pass: GPUComputePassEncoder; token: TimingToken | null } = timingHelper
    ? timingHelper.beginComputePassWithToken(cmdEncoder)
    : { pass: cmdEncoder.beginComputePass(), token: null };
  const passEncoder = passWithTiming.pass;

  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(workgroupsX, 1, 1);
  passEncoder.end();

  const commandBuffer = cmdEncoder.finish();

  const token = passWithTiming.token;
  const afterSubmit =
    timingHelper && timingHelper.hasTimestampSupport() && token
      ? () => {
          timingHelper
            .getResultForToken(token)
            .then((gpuTimeNs) => {
              const gpuTimeMs = gpuTimeNs / 1_000_000;
              getGPUMetricsProvider().recordMetric({
                batchId: `${archetypeId}-timing`,
                entityCount: batch.entityCount,
                timestamp: performance.now(),
                gpu: true,
                gpuComputeTimeMs: gpuTimeMs,
                gpuComputeTimeNs: gpuTimeNs,
                workgroupsDispatched: workgroupsX,
              });
            })
            .catch(() => {});
        }
      : undefined;

  if (submit) {
    submit(commandBuffer, afterSubmit);
  } else {
    queue.submit([commandBuffer]);
    afterSubmit?.();
  }

  return { outputBuffer, outputBufferTag, entityCount: batch.entityCount, archetypeId };
}
