import type { PhysicsBatchDescriptor } from '../../../types';
import type { MotionAppConfig } from '../../../plugin';
import type { PendingReadback } from '../../../webgpu/async-readback';
import { dispatchPhysicsBatch } from '../dispatch';
import { PHYSICS_STATE_STRIDE } from '../../../webgpu/physics-shader';
import { getPersistentGPUBufferManager } from '../../../webgpu/persistent-buffer-manager';
import { markPhysicsGPUEntity, setPendingReadbackCount } from '../../../webgpu/sync-manager';
import type { ComputeBatchProcessor } from '../../batch';
import { physicsValidationShadow } from '../physics-validation';
import type { WebGPUComputeRuntime } from './runtime';

export type PhysicsReadbackTag = {
  kind: 'physics';
  finished?: Uint32Array;
  dtMs?: number;
  dtSec?: number;
  maxVelocity?: number;
  slotCount?: number;
};

export async function dispatchPhysicsBatchForArchetype(params: {
  runtime: WebGPUComputeRuntime;
  device: GPUDevice;
  processor: ComputeBatchProcessor;
  config: MotionAppConfig;
  batch: PhysicsBatchDescriptor;
  dtMs: number;
  dtSec: number;
  maxVelocity: number;
}): Promise<void> {
  const { runtime, device, processor, config, batch, dtMs, dtSec, maxVelocity } = params;

  const sp = runtime.stagingPool;
  const readbackManager = runtime.readbackManager;
  const queue = device.queue;

  if (!sp) return;

  const physics = batch.physics;
  const baseArchetypeId = physics.baseArchetypeId;
  const slotCount = physics.slotCount | 0;
  const stride = physics.stride | 0;
  const channels = physics.channels;

  let leaseId = batch.entityIdsLeaseId;

  const ids = batch.entityIds as ArrayLike<number>;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as number;
    if (typeof id === 'number' && Number.isFinite(id)) {
      markPhysicsGPUEntity(id);
    }
  }

  const persistentBufferManager = getPersistentGPUBufferManager(device);

  runtime.physicsParams[0] = dtMs;
  runtime.physicsParams[1] = dtSec;
  runtime.physicsParams[2] = maxVelocity;
  runtime.physicsParams[3] = 0;

  const physicsParamsBuffer = persistentBufferManager.getOrCreateBuffer(
    'physics:params',
    runtime.physicsParams,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    { label: 'physics-params', skipChangeDetection: true },
  );

  const requiredBytes = Math.max(0, slotCount) * PHYSICS_STATE_STRIDE * 4;
  let stateBuffer: GPUBuffer;
  if (physics.stateData && physics.stateVersion !== undefined) {
    stateBuffer = persistentBufferManager.getOrCreateBuffer(
      `physics:states:${baseArchetypeId}`,
      physics.stateData,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      {
        label: `physics-states-${baseArchetypeId}`,
        allowGrowth: true,
        contentVersion: physics.stateVersion,
      },
    );
  } else {
    stateBuffer = persistentBufferManager.getOrCreateEmptyBuffer(
      `physics:states:${baseArchetypeId}`,
      requiredBytes,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      {
        label: `physics-states-${baseArchetypeId}`,
        allowGrowth: true,
        contentVersion: physics.stateVersion,
      },
    ).buffer;
  }

  const validateEnabled =
    config.physicsValidation === true || config.debug?.physicsValidation === true;
  if (validateEnabled && physics.stateData) {
    physicsValidationShadow.set(baseArchetypeId, {
      slotCount,
      state: new Float32Array(physics.stateData),
      lastWarnFrame: -1,
    });
  }

  const outputBytes = Math.max(0, slotCount) * 4;
  const finishedBytes = Math.max(0, slotCount) * 4;
  const outputBuffer = device.createBuffer({
    size: outputBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: `physics-output-${baseArchetypeId}`,
  });
  const finishedBuffer = device.createBuffer({
    size: finishedBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: `physics-finished-${baseArchetypeId}`,
  });

  await dispatchPhysicsBatch({
    device,
    queue,
    timingHelper: runtime.timingHelper,
    archetypeId: baseArchetypeId,
    slotCount,
    workgroupHint: batch.workgroupHint,
    stateBuffer,
    paramsBuffer: physicsParamsBuffer,
    outputBuffer,
    finishedBuffer,
  });

  const stagingSize = outputBytes + finishedBytes;
  const stagingBuffer = sp.acquire(baseArchetypeId, stagingSize);
  if (!stagingBuffer) {
    outputBuffer.destroy();
    finishedBuffer.destroy();
    if (typeof leaseId === 'number') {
      processor.releaseEntityIds(leaseId);
    }
    return;
  }
  if (typeof leaseId === 'number') {
    processor.markEntityIdsInFlight(leaseId);
  }
  sp.markInFlight(stagingBuffer);

  const copyEncoder = device.createCommandEncoder({
    label: `copy-physics-${baseArchetypeId}`,
  });
  copyEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputBytes);
  copyEncoder.copyBufferToBuffer(finishedBuffer, 0, stagingBuffer, outputBytes, finishedBytes);
  queue.submit([copyEncoder.finish()]);
  outputBuffer.destroy();
  finishedBuffer.destroy();

  const decode: PendingReadback['decode'] = (mappedRange: ArrayBuffer) => {
    const outValues = new Float32Array(mappedRange.slice(0, outputBytes));
    const finished = new Uint32Array(mappedRange.slice(outputBytes, outputBytes + finishedBytes));
    return {
      archetypeId: baseArchetypeId,
      entityIds: batch.entityIds,
      values: outValues,
      stride,
      channels,
      leaseId,
      byteSize: stagingSize,
      tag: { kind: 'physics' as const, finished, dtMs, dtSec, maxVelocity, slotCount },
    };
  };

  const mapPromise = stagingBuffer.mapAsync(GPUMapMode.READ);
  readbackManager?.enqueueMapAsyncDecoded(
    baseArchetypeId,
    stagingBuffer,
    mapPromise,
    stagingSize,
    decode,
    200,
    { kind: 'physics' as const },
  );
  setPendingReadbackCount(readbackManager?.getPendingCount?.() ?? 0);
}
