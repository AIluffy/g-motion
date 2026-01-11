/**
 * Viewport Culling Pass - Sync Version
 *
 * GPU compute pass for viewport culling with synchronous readback.
 * Culls entities outside the viewport and compacts the output buffer.
 */

import type { ViewportCullingBatchDescriptor } from '../../../types';
import { ENTITY_BOUNDS_STRIDE, RENDER_STATE_EX_STRIDE } from './culling-types';
import {
  getScratch,
  getFrustumBuffer,
  updateFrustumBuffer,
  resetParamsBuffer,
} from './culling-types';
import { getCullingCompactPipeline, cullingCompactBindGroupLayout } from './culling-pipeline';
import { resolveViewportBounds } from '../viewport-bounds';

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
  const pipeline = await getCullingCompactPipeline(device);
  if (!pipeline || !cullingCompactBindGroupLayout) {
    return {
      entityCount: batch.entityCount,
      entityIds: batch.entityIds as any,
      leaseId: batch.entityIdsLeaseId,
      outputBuffer: rawOutputBuffer,
    };
  }

  const now = Date.now();
  const entityCount = batch.entityCount;
  const renderStatesBufferSize = entityCount * RENDER_STATE_EX_STRIDE * 4;
  const boundsBufferSize = entityCount * ENTITY_BOUNDS_STRIDE * 4;

  const scratch = getScratch(archetypeId, entityCount);
  const statesU32 = scratch.statesU32;
  const statesF32 = scratch.statesF32;
  const boundsF32 = scratch.boundsF32;

  const firstId = (batch.entityIds as any)[0] as number | undefined;
  const packetArchetype = firstId != null ? world.getEntityArchetype?.(firstId) : undefined;
  const stableArchetype =
    packetArchetype && packetArchetype.id === archetypeId ? packetArchetype : undefined;

  const stableRenderBuffer = stableArchetype ? stableArchetype.getBuffer?.('Render') : undefined;
  const stableIndices = stableArchetype
    ? (stableArchetype as any).getInternalEntityIndices?.()
    : undefined;
  const stableTypedRendererCode = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'rendererCode')
    : undefined;
  const stableTypedVersion = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'version')
    : undefined;
  const stableTypedRenderedVersion = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'renderedVersion')
    : undefined;

  for (let i = 0; i < entityCount; i++) {
    const id = (batch.entityIds as any)[i] as number;
    const a = stableArchetype ?? world.getEntityArchetype?.(id);
    let rendererCode = 0;
    let version = 0;
    let renderedVersion = -1;
    let bounds: any = null;

    if (a && typeof (a as any).getBuffer === 'function') {
      const renderBuffer = stableArchetype ? stableRenderBuffer : a.getBuffer?.('Render');
      const indices = stableArchetype ? stableIndices : (a as any).getInternalEntityIndices?.();
      const index = indices ? indices.get(id) : undefined;
      if (renderBuffer && index !== undefined) {
        const render = renderBuffer[index] as any;
        const typed = stableArchetype
          ? stableTypedRendererCode
          : a.getTypedBuffer?.('Render', 'rendererCode');
        rendererCode = typed ? typed[index] : (render?.rendererCode ?? 0);
        const typedV = stableArchetype
          ? stableTypedVersion
          : a.getTypedBuffer?.('Render', 'version');
        const typedRV = stableArchetype
          ? stableTypedRenderedVersion
          : a.getTypedBuffer?.('Render', 'renderedVersion');
        version = typedV ? typedV[index] : (render?.version ?? 0);
        renderedVersion = typedRV ? typedRV[index] : (render?.renderedVersion ?? -1);
        const b = render?.props?.__bounds as any;
        if (
          b &&
          typeof b.centerX === 'number' &&
          typeof b.centerY === 'number' &&
          typeof b.radius === 'number'
        ) {
          bounds = b;
        } else {
          bounds = resolveViewportBounds(render?.target, now);
        }
      }
    } else if (a && typeof (a as any).getEntityData === 'function') {
      const render = (a as any).getEntityData(id, 'Render');
      if (render) {
        rendererCode = render.rendererCode ?? 0;
        version = render.version ?? 0;
        renderedVersion = render.renderedVersion ?? -1;
        const b = render?.props?.__bounds as any;
        if (
          b &&
          typeof b.centerX === 'number' &&
          typeof b.centerY === 'number' &&
          typeof b.radius === 'number'
        ) {
          bounds = b;
        } else {
          bounds = resolveViewportBounds(render?.target, now);
        }
      }
    }

    const base = i * RENDER_STATE_EX_STRIDE;
    statesU32[base + 0] = id >>> 0;
    statesU32[base + 1] = version >>> 0;
    statesU32[base + 2] = renderedVersion >>> 0;
    statesU32[base + 3] = 1;
    statesU32[base + 4] = rendererCode >>> 0;
    statesF32[base + 5] = 0;
    statesF32[base + 6] = batch.statesData[i * 4 + 1] ?? 0;
    statesU32[base + 7] = 0;

    const bb = i * ENTITY_BOUNDS_STRIDE;
    if (bounds) {
      boundsF32[bb + 0] = bounds.centerX;
      boundsF32[bb + 1] = bounds.centerY;
      boundsF32[bb + 2] = bounds.centerZ ?? 0;
      boundsF32[bb + 3] = bounds.radius;
    } else {
      boundsF32[bb + 0] = 0;
      boundsF32[bb + 1] = 0;
      boundsF32[bb + 2] = 0;
      boundsF32[bb + 3] = 0;
    }
  }

  const frustumF32 = getFrustumBuffer();
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
  updateFrustumBuffer(frustumF32, viewportW, viewportH);
  resetParamsBuffer(rawStride);

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
  queue.writeBuffer(
    paramsGPU,
    0,
    new Uint32Array([Math.max(1, rawStride | 0), 0, 0, 0]).buffer as ArrayBuffer,
    0,
    16,
  );
  queue.writeBuffer(visibleCountGPU, 0, new Uint32Array([0]).buffer as ArrayBuffer, 0, 4);

  const bindGroup = device.createBindGroup({
    layout: cullingCompactBindGroupLayout,
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
