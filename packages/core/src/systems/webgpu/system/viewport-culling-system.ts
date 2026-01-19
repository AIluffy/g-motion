import type { GPUBatchDescriptor } from '../../../types';
import type { World } from '../../../world';
import type { PendingReadback } from '../../../webgpu/async-readback';
import type { ComputeBatchProcessor } from '../../batch';
import {
  runViewportCullingCompactionPass,
  runViewportCullingCompactionPassAsync,
} from '../../../webgpu/passes/viewport';
import { setPendingReadbackCount } from '../../../webgpu/sync-manager';
import type { WebGPUEngine } from '../../../webgpu/engine';
import { tryReleasePooledOutputBufferFromTag } from '../../../webgpu/output-buffer-pool';
import type { WebGPUFrameEncoder } from '../../../webgpu/command-encoder';

export type CullingReadbackTag = {
  kind: 'culling';
  frameId: number;
  outputBuffer: GPUBuffer;
  sourceOutputBufferTag?: unknown;
  rawStride: number;
  outputStride: number;
  rawChannels: Array<{ index: number; property: string }>;
  outputChannels: Array<{ index: number; property: string }>;
  entityCountMax: number;
  visibleCount?: number;
};

export type ViewportCullingResult =
  | { kind: 'enqueued' }
  | {
      kind: 'continue';
      outputBuffer: GPUBuffer;
      entityCount: number;
      entityIdsForReadback: ArrayLike<number>;
      leaseId: number | undefined;
    };

export async function maybeRunViewportCulling(params: {
  engine: WebGPUEngine;
  device: GPUDevice;
  queue: GPUQueue;
  world: World;
  processor: ComputeBatchProcessor;
  archetypeId: string;
  batch: GPUBatchDescriptor;
  outputBuffer: GPUBuffer;
  sourceOutputBufferTag?: unknown;
  entityCount: number;
  entityIdsForReadback: ArrayLike<number>;
  leaseId: number | undefined;
  rawStride: number;
  outputStride: number;
  rawChannels: Array<{ index: number; property: string }>;
  outputChannels: Array<{ index: number; property: string }>;
  asyncEnabled: boolean;
  frame?: WebGPUFrameEncoder;
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void;
}): Promise<ViewportCullingResult> {
  const {
    engine,
    device,
    queue,
    world,
    processor,
    archetypeId,
    batch,
    outputBuffer,
    sourceOutputBufferTag,
    entityCount,
    entityIdsForReadback,
    leaseId,
    rawStride,
    outputStride,
    rawChannels,
    outputChannels,
    asyncEnabled,
    frame,
    submit,
  } = params;

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
  if (!(viewportW > 0 && viewportH > 0)) {
    return {
      kind: 'continue',
      outputBuffer,
      entityCount,
      entityIdsForReadback,
      leaseId,
    };
  }

  const readbackManager = engine.readbackManager;

  if (entityCount <= 0) {
    return {
      kind: 'continue',
      outputBuffer,
      entityCount,
      entityIdsForReadback,
      leaseId,
    };
  }

  if (asyncEnabled && readbackManager) {
    const pending = await runViewportCullingCompactionPassAsync(
      device,
      queue,
      world,
      archetypeId,
      batch,
      outputBuffer,
      rawStride,
      frame,
      submit,
    );
    if (pending) {
      engine.latestAsyncCullingFrameByArchetype.set(archetypeId, engine.frameId);

      if (typeof leaseId === 'number') {
        processor.releaseEntityIds(leaseId);
      }
      if (!sourceOutputBufferTag) {
        try {
          outputBuffer.destroy();
        } catch {}
      }

      const cullingTag: CullingReadbackTag = {
        kind: 'culling',
        frameId: engine.frameId,
        outputBuffer: pending.outputBuffer,
        sourceOutputBufferTag,
        rawStride,
        outputStride,
        rawChannels,
        outputChannels,
        entityCountMax: pending.entityCountMax,
      };

      const decode: PendingReadback['decode'] = (mappedRange: ArrayBuffer) => {
        const u32 = new Uint32Array(mappedRange);
        const visibleCount = Math.min(pending.entityCountMax, u32[0] >>> 0);

        let compactLeaseId: number | undefined;
        let compactEntityIds: Int32Array = new Int32Array(0);
        if (visibleCount > 0) {
          const lease = processor.acquireEntityIds(visibleCount);
          compactLeaseId = lease.leaseId;
          compactEntityIds = lease.buffer.subarray(0, visibleCount);
          compactEntityIds.set(u32.subarray(1, 1 + visibleCount));
        }

        return {
          entityIds: compactEntityIds,
          leaseId: compactLeaseId,
          tag: { ...cullingTag, visibleCount },
          byteSize: 4 + visibleCount * 4,
        };
      };

      readbackManager.enqueueMapAsyncDecoded(
        archetypeId,
        pending.readback,
        pending.mapPromise,
        4 + pending.entityCountMax * 4,
        decode,
        200,
        cullingTag,
      );
      setPendingReadbackCount(readbackManager.getPendingCount());
      return { kind: 'enqueued' };
    }
  }

  const cullRes = await runViewportCullingCompactionPass(
    device,
    queue,
    world,
    processor,
    archetypeId,
    batch,
    outputBuffer,
    rawStride,
  );
  let nextOutputBuffer = outputBuffer;
  if (cullRes.outputBuffer !== outputBuffer) {
    if (sourceOutputBufferTag) {
      tryReleasePooledOutputBufferFromTag(sourceOutputBufferTag);
    } else {
      outputBuffer.destroy();
    }
    nextOutputBuffer = cullRes.outputBuffer;
  }

  return {
    kind: 'continue',
    outputBuffer: nextOutputBuffer,
    entityCount: cullRes.entityCount,
    entityIdsForReadback: cullRes.entityIds,
    leaseId: cullRes.leaseId,
  };
}
