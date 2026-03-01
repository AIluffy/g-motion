/**
 * Viewport Culling Pass - Async Version
 *
 * GPU compute pass for viewport culling with async readback.
 * Returns a promise for the readback operation.
 */

import type { ViewportCullingBatchDescriptor } from '../../types';
import type { WebGPUFrameEncoder } from '../../command-encoder';
import { getCullingCompactPipeline } from './culling-pipeline';
import { collectViewportCullingCPUInputs } from './culling-types';

// Callers must enqueue mapPromise with AsyncReadbackManager and pass release for cleanup.
export type ViewportCullingAsyncReadback = {
  entityCountMax: number;
  outputBuffer: GPUBuffer;
  readback: GPUBuffer;
  mapPromise: Promise<void>;
};

export async function runViewportCullingCompactionPassAsync(
  device: GPUDevice,
  queue: GPUQueue,
  world: any,
  archetypeId: string,
  batch: ViewportCullingBatchDescriptor,
  rawOutputBuffer: GPUBuffer,
  rawStride: number,
  frame?: WebGPUFrameEncoder,
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void,
): Promise<ViewportCullingAsyncReadback | null> {
  const state = await getCullingCompactPipeline(device);
  if (!state) {
    return null;
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

  const workgroupsX = Math.ceil(entityCount / 64);

  const readback = device.createBuffer({
    size: 4 + entityCount * 4,
    usage: (GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-readback-${archetypeId}`,
  });

  let resolveMap: (() => void) | null = null;
  let rejectMap: ((e: unknown) => void) | null = null;
  const mapPromise = new Promise<void>((resolve, reject) => {
    resolveMap = resolve;
    rejectMap = reject;
  });

  const afterSubmit = () => {
    const p = readback.mapAsync((GPUMapMode as any).READ).then(() => undefined);
    p.then(() => resolveMap?.()).catch((e) => rejectMap?.(e));
  };

  if (frame) {
    const pass = frame.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupsX, 1, 1);

    frame.recordCopy(visibleCountGPU, 0, readback, 0, 4);
    frame.recordCopy(compactedEntityIdsGPU, 0, readback, 4, entityCount * 4);

    frame.recordAfterSubmit(() => {
      try {
        renderStatesGPU.destroy();
      } catch {}
      try {
        boundsGPU.destroy();
      } catch {}
      try {
        frustumGPU.destroy();
      } catch {}
      try {
        paramsGPU.destroy();
      } catch {}
      try {
        visibleCountGPU.destroy();
      } catch {}
      try {
        compactedEntityIdsGPU.destroy();
      } catch {}
      afterSubmit();
    });

    return {
      entityCountMax: entityCount,
      outputBuffer: compactedOutputsGPU,
      readback,
      mapPromise,
    };
  }

  const encoder = device.createCommandEncoder({ label: `motion-cull-compact-${archetypeId}` });
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();

  encoder.copyBufferToBuffer(visibleCountGPU, 0, readback, 0, 4);
  encoder.copyBufferToBuffer(compactedEntityIdsGPU, 0, readback, 4, entityCount * 4);
  const commandBuffer = encoder.finish();

  renderStatesGPU.destroy();
  boundsGPU.destroy();
  frustumGPU.destroy();
  paramsGPU.destroy();
  visibleCountGPU.destroy();
  compactedEntityIdsGPU.destroy();

  if (submit) {
    submit(commandBuffer, afterSubmit);
  } else {
    queue.submit([commandBuffer]);
    afterSubmit();
  }

  return {
    entityCountMax: entityCount,
    outputBuffer: compactedOutputsGPU,
    readback,
    mapPromise,
  };
}
