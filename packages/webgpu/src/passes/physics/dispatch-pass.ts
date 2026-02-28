import { getGPUMetricsProvider } from '../../metrics-provider';
import { getPipelineForWorkgroup, selectWorkgroupSize } from '../../pipeline';
import type { TimingHelper, TimingToken } from '../../timing-helper';
import { createDebugger } from '@g-motion/shared';
import type { WebGPUFrameEncoder } from '../../command-encoder';

const warn = createDebugger('WebGPUDispatch', 'warn');

export async function dispatchPhysicsBatch(input: {
  device: GPUDevice;
  queue: GPUQueue;
  timingHelper: TimingHelper | null;
  archetypeId: string;
  slotCount: number;
  workgroupHint: number;
  stateBuffer: GPUBuffer;
  paramsBuffer: GPUBuffer;
  outputBuffer: GPUBuffer;
  finishedBuffer: GPUBuffer;
  frame?: WebGPUFrameEncoder;
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void;
}): Promise<{
  archetypeId: string;
  slotCount: number;
  outputBuffer: GPUBuffer;
  finishedBuffer: GPUBuffer;
}> {
  const {
    device,
    queue,
    timingHelper,
    archetypeId,
    slotCount,
    workgroupHint,
    stateBuffer,
    paramsBuffer,
    outputBuffer,
    finishedBuffer,
    frame,
    submit,
  } = input;

  if (slotCount <= 0) {
    throw new Error('dispatchPhysicsBatch: slotCount must be > 0');
  }

  const pipeline = await getPipelineForWorkgroup(device, workgroupHint, 'physics');
  if (!pipeline) {
    throw new Error(`dispatchPhysicsBatch: failed to get pipeline for workgroup ${workgroupHint}`);
  }

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
      { binding: 3, resource: { buffer: finishedBuffer } },
    ],
  });

  const workgroupSize = selectWorkgroupSize(workgroupHint);
  const workgroupsX = Math.ceil(slotCount / workgroupSize);

  if (frame) {
    const passEncoder = frame.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(workgroupsX, 1, 1);
    return { archetypeId, slotCount, outputBuffer, finishedBuffer };
  }

  const cmdEncoder = device.createCommandEncoder({
    label: `dispatch-physics-${archetypeId}`,
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

  const physicsToken = passWithTiming.token;
  const afterSubmit =
    timingHelper && timingHelper.hasTimestampSupport() && physicsToken
      ? () => {
          timingHelper
            .getResultForToken(physicsToken)
            .then((gpuTimeNs) => {
              const gpuTimeMs = gpuTimeNs / 1_000_000;
              getGPUMetricsProvider().recordMetric({
                batchId: `${archetypeId}-physics-timing`,
                entityCount: slotCount,
                timestamp: performance.now(),
                gpu: true,
                gpuComputeTimeMs: gpuTimeMs,
                gpuComputeTimeNs: gpuTimeNs,
                workgroupsDispatched: workgroupsX,
              });
            })
            .catch((error) => {
              warn('timingHelper.getResult failed', { archetypeId, slotCount, error });
            });
        }
      : undefined;

  if (submit) {
    submit(commandBuffer, afterSubmit);
  } else {
    queue.submit([commandBuffer]);
    afterSubmit?.();
  }

  return { archetypeId, slotCount, outputBuffer, finishedBuffer };
}
