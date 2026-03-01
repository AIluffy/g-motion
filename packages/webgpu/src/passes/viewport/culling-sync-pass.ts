/**
 * Viewport Culling Pass - Sync Version
 *
 * GPU compute pass for viewport culling with synchronous readback.
 * Culls entities outside the viewport and compacts the output buffer.
 */

import type { ViewportCullingBatchDescriptor } from '../../types';
import { getCullingCompactPipeline } from './culling-pipeline';
import { collectViewportCullingCPUInputs } from './culling-types';

export async function runViewportCullingCompactionPass(
  device: GPUDevice,
  queue: GPUQueue,
  world: any,
  processor: any,
  archetypeId: string,
  batch: ViewportCullingBatchDescriptor,
  rawOutputBuffer: GPUBuffer,
  rawStride: number,
): Promise<{
  entityCount: number;
  entityIds: Int32Array;
  leaseId?: number;
  outputBuffer: GPUBuffer;
}> {
  const state = await getCullingCompactPipeline(device);
  if (!state) {
    return {
      entityCount: batch.entityCount,
      entityIds: batch.entityIds as any,
      leaseId: batch.entityIdsLeaseId,
      outputBuffer: rawOutputBuffer,
    };
  }
  const { pipeline, bindGroupLayout } = state;

  const { entityCount, renderStatesBufferSize, boundsBufferSize, scratch, frustumF32, paramsU32 } =
    collectViewportCullingCPUInputs({
      world,
      archetypeId,
      batch,
      rawStride,
    });
  const boundsF32 = scratch.boundsF32;

  const renderStatesGPU = device.createBuffer({
    size: renderStatesBufferSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-states-${archetypeId}`,
  });
  const boundsGPU = device.createBuffer({
    size: boundsBufferSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-bounds-${archetypeId}`,
  });
  const frustumGPU = device.createBuffer({
    size: frustumF32.byteLength,
    usage: (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-frustum-${archetypeId}`,
  });
  const paramsGPU = device.createBuffer({
    size: 16,
    usage: (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-params-${archetypeId}`,
  });

  const compactedOutputsGPU = device.createBuffer({
    size: entityCount * Math.max(1, rawStride | 0) * 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-cull-compacted-outputs-${archetypeId}`,
  });

  const compactedEntityIdsGPU = device.createBuffer({
    size: entityCount * 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-cull-compacted-ids-${archetypeId}`,
  });

  const visibleCountGPU = device.createBuffer({
    size: 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-visible-count-${archetypeId}`,
  });

  queue.writeBuffer(renderStatesGPU, 0, scratch.statesAB as ArrayBuffer, 0, renderStatesBufferSize);
  queue.writeBuffer(boundsGPU, 0, boundsF32.buffer as ArrayBuffer, 0, boundsBufferSize);
  queue.writeBuffer(frustumGPU, 0, frustumF32.buffer as ArrayBuffer, 0, frustumF32.byteLength);
  queue.writeBuffer(paramsGPU, 0, paramsU32.buffer as ArrayBuffer, 0, 16);
  queue.writeBuffer(visibleCountGPU, 0, new Uint32Array([0]).buffer as ArrayBuffer, 0, 4);

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: renderStatesGPU } },
      { binding: 1, resource: { buffer: boundsGPU } },
      { binding: 2, resource: { buffer: frustumGPU } },
      { binding: 3, resource: { buffer: rawOutputBuffer } },
      { binding: 4, resource: { buffer: compactedOutputsGPU } },
      { binding: 5, resource: { buffer: compactedEntityIdsGPU } },
      { binding: 6, resource: { buffer: visibleCountGPU } },
      { binding: 7, resource: { buffer: paramsGPU } },
    ],
  });

  const countReadback = device.createBuffer({
    size: 4,
    usage: (GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-count-readback-${archetypeId}`,
  });
  const idsReadback = device.createBuffer({
    size: entityCount * 4,
    usage: (GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-ids-readback-${archetypeId}`,
  });

  const encoder = device.createCommandEncoder({ label: `motion-cull-compact-${archetypeId}` });
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupsX = Math.ceil(entityCount / 64);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();
  encoder.copyBufferToBuffer(visibleCountGPU, 0, countReadback, 0, 4);
  encoder.copyBufferToBuffer(compactedEntityIdsGPU, 0, idsReadback, 0, entityCount * 4);
  queue.submit([encoder.finish()]);

  await Promise.all([
    countReadback.mapAsync((GPUMapMode as any).READ),
    idsReadback.mapAsync((GPUMapMode as any).READ),
  ]);

  const countU32 = new Uint32Array(countReadback.getMappedRange());
  const visibleCount = Math.min(entityCount, countU32[0] >>> 0);
  const idsU32 = new Uint32Array(idsReadback.getMappedRange());

  let compactLeaseId: number | undefined;
  let compactEntityIds: Int32Array;
  if (visibleCount > 0) {
    const lease = processor.acquireEntityIds(visibleCount);
    compactLeaseId = lease.leaseId;
    compactEntityIds = lease.buffer.subarray(0, visibleCount);
    compactEntityIds.set(idsU32.subarray(0, visibleCount));
  } else {
    compactEntityIds = new Int32Array(0);
  }

  countReadback.unmap();
  idsReadback.unmap();
  countReadback.destroy();
  idsReadback.destroy();
  renderStatesGPU.destroy();
  boundsGPU.destroy();
  frustumGPU.destroy();
  paramsGPU.destroy();
  visibleCountGPU.destroy();
  compactedEntityIdsGPU.destroy();

  if (typeof (batch as any).entityIdsLeaseId === 'number') {
    processor.releaseEntityIds((batch as any).entityIdsLeaseId);
  }

  return {
    entityCount: visibleCount,
    entityIds: compactEntityIds,
    leaseId: compactLeaseId,
    outputBuffer: compactedOutputsGPU,
  };
}
