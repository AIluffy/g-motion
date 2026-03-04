import { getGPUMetricsProvider } from '../../runtime/metrics';
import {
  getPipelineForWorkgroup,
  recordWorkgroupTiming,
  selectWorkgroupSize,
} from '../../gpu/workgroup';
import type { GPUTimestampQueryManager } from '../../gpu/timestamp';
import { createDebugger } from '@g-motion/shared';
import type { WebGPUFrameEncoder } from '../../runtime/encoder';

const warn = createDebugger('WebGPUDispatch', 'warn');

export async function dispatchPhysicsBatch(input: {
  device: GPUDevice;
  queue: GPUQueue;
  timestampManager: GPUTimestampQueryManager | null;
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
    timestampManager,
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

  const workgroupSize = selectWorkgroupSize(workgroupHint);
  const pipeline = await getPipelineForWorkgroup(device, workgroupSize, 'physics');
  if (!pipeline) {
    throw new Error(`dispatchPhysicsBatch: failed to get pipeline for workgroup ${workgroupSize}`);
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

  const workgroupsX = Math.ceil(slotCount / workgroupSize);

  if (frame) {
    const passEncoder = frame.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(workgroupsX, 1, 1);
    return { archetypeId, slotCount, outputBuffer, finishedBuffer };
  }

  const startTime = performance.now();
  const cmdEncoder = device.createCommandEncoder({
    label: `dispatch-physics-${archetypeId}`,
  });

  const descriptor: GPUComputePassDescriptor = {
    label: `dispatch-physics-${archetypeId}-pass`,
  };

  const queryIndex = timestampManager?.injectTimestampWrites(descriptor) ?? null;
  const passEncoder = cmdEncoder.beginComputePass(descriptor);

  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(workgroupsX, 1, 1);
  passEncoder.end();

  const commandBuffer = cmdEncoder.finish();

  const afterSubmit = () => {
    const endTime = performance.now();
    const cpuDurationMs = endTime - startTime;

    if (timestampManager && timestampManager.hasSupport() && queryIndex !== null) {
      timestampManager
        .resolveAndReadback(cmdEncoder, queryIndex)
        .then((result) => {
          const durationMs = result ? result.durationMs : cpuDurationMs;
          const durationNs = result ? result.durationNs : cpuDurationMs * 1_000_000;

          getGPUMetricsProvider().recordMetric({
            batchId: `${archetypeId}-physics-timing`,
            entityCount: slotCount,
            timestamp: result ? result.timestamp : performance.now(),
            gpu: true,
            gpuComputeTimeMs: durationMs,
            gpuComputeTimeNs: durationNs,
            workgroupsDispatched: workgroupsX,
            workgroupSize,
          });
          recordWorkgroupTiming(archetypeId, workgroupSize, durationMs);
        })
        .catch((error) => {
          warn('timestampManager.resolveAndReadback failed', { archetypeId, slotCount, error });
          recordCPUMetric();
        });
    } else {
      recordCPUMetric();
    }

    function recordCPUMetric() {
      getGPUMetricsProvider().recordMetric({
        batchId: `${archetypeId}-physics-timing`,
        entityCount: slotCount,
        timestamp: performance.now(),
        gpu: true,
        gpuComputeTimeMs: cpuDurationMs,
        gpuComputeTimeNs: cpuDurationMs * 1_000_000,
        workgroupsDispatched: workgroupsX,
        workgroupSize,
      });
      recordWorkgroupTiming(archetypeId, workgroupSize, cpuDurationMs);
    }
  };

  if (submit) {
    submit(commandBuffer, afterSubmit);
  } else {
    queue.submit([commandBuffer]);
    afterSubmit?.();
  }

  return { archetypeId, slotCount, outputBuffer, finishedBuffer };
}
