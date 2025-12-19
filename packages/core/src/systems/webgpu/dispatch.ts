/* eslint-disable @typescript-eslint/no-explicit-any */

import { getGPUMetricsProvider } from '../../webgpu/metrics-provider';
import { ArchetypeBatchDescriptor } from '../../types';
import { getPipelineForWorkgroup } from './pipeline';
import type { TimingHelper } from '../../webgpu/timing-helper';

/**
 * Dispatch a compute shader for a single archetype batch
 *
 * Responsibilities:
 * 1. Create GPU buffers (states, keyframes, output)
 * 2. Get pipeline and create bind group
 * 3. Dispatch compute shader with adaptive workgroup sizing
 * 4. Record timing metrics
 * 5. Prepare for async readback (buffers managed externally)
 * 6. Clean up GPU buffers
 *
 * Note: This function is prepared for async integration. Currently, the WebGPUComputeSystem
 * uses inline dispatch in its update() method with direct staging pool management.
 */
export async function dispatchGPUBatch(
  device: GPUDevice,
  queue: GPUQueue,
  batch: ArchetypeBatchDescriptor,
  timingHelper: TimingHelper | null,
  archetypeId: string,
  channelCount: number,
): Promise<{ outputBuffer: GPUBuffer; entityCount: number; archetypeId: string }> {
  if (batch.entityCount === 0) {
    throw new Error('dispatchGPUBatch: entityCount must be > 0');
  }

  // 1. Create GPU buffers for this archetype batch
  const stateGPUBuffer = device.createBuffer({
    size: batch.statesData.byteLength,
    mappedAtCreation: true,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as any,
    label: `state-${archetypeId}`,
  });
  new Float32Array(stateGPUBuffer.getMappedRange()).set(batch.statesData);
  stateGPUBuffer.unmap();

  const keyframeGPUBuffer = device.createBuffer({
    size: batch.keyframesData.byteLength,
    mappedAtCreation: true,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as any,
    label: `keyframes-${archetypeId}`,
  });
  new Float32Array(keyframeGPUBuffer.getMappedRange()).set(batch.keyframesData);
  keyframeGPUBuffer.unmap();

  const outputBuffer = device.createBuffer({
    size: batch.entityCount * Math.max(channelCount, 1) * 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as any,
    label: `output-${archetypeId}`,
  });

  // 2. Get pipeline (with adaptive workgroup support)
  const pipeline = await getPipelineForWorkgroup(device, batch.workgroupHint);
  if (!pipeline) {
    stateGPUBuffer.destroy();
    keyframeGPUBuffer.destroy();
    outputBuffer.destroy();
    throw new Error(
      `dispatchGPUBatch: failed to get pipeline for workgroup ${batch.workgroupHint}`,
    );
  }

  // 3. Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateGPUBuffer } },
      { binding: 1, resource: { buffer: keyframeGPUBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });

  // 4. Dispatch with adaptive workgroup sizing
  const workgroupSize = batch.workgroupHint;
  const workgroupsX = Math.ceil(batch.entityCount / workgroupSize);

  const cmdEncoder = device.createCommandEncoder({
    label: `dispatch-${archetypeId}`,
  });

  // Begin compute pass with GPU timing if supported
  const passEncoder = timingHelper
    ? timingHelper.beginComputePass(cmdEncoder)
    : cmdEncoder.beginComputePass();

  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(workgroupsX, 1, 1);
  passEncoder.end();

  const commandBuffer = cmdEncoder.finish();
  queue.submit([commandBuffer]);

  // Retrieve GPU timing asynchronously (non-blocking, 1-2 frame latency)
  if (timingHelper && timingHelper.hasTimestampSupport()) {
    timingHelper
      .getResult()
      .then((gpuTimeNs) => {
        const gpuTimeMs = gpuTimeNs / 1_000_000;

        // Update the most recent metric for this archetype with GPU timing
        // Note: This arrives 1-2 frames late, which is acceptable for monitoring
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
      .catch(() => {
        // Silently ignore timing errors to avoid per-frame logging
      });
  }

  // 5. Cleanup dispatch buffers (output buffer is owned by caller for readback)
  setTimeout(() => {
    stateGPUBuffer.destroy();
    keyframeGPUBuffer.destroy();
  }, 16);

  // Return output buffer for readback via staging pool
  return { outputBuffer, entityCount: batch.entityCount, archetypeId };
}
