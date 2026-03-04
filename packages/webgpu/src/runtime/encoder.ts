import type { GPUTimestampQueryManager } from '../gpu/timestamp';

type CopyCommand = {
  src: GPUBuffer;
  srcOffset: number;
  dst: GPUBuffer;
  dstOffset: number;
  size: number;
};

export type WebGPUFrameEncoder = {
  beginComputePass(): GPUComputePassEncoder;
  recordCopy(
    src: GPUBuffer,
    srcOffset: number,
    dst: GPUBuffer,
    dstOffset: number,
    size: number,
  ): void;
  recordAfterSubmit(cb: () => void): void;
  finish(): { commandBuffer: GPUCommandBuffer; afterSubmit?: () => void };
};

export function createWebGPUFrameEncoder(params: {
  device: GPUDevice;
  timestampManager: GPUTimestampQueryManager | null;
  label: string;
}): WebGPUFrameEncoder {
  const { device, timestampManager, label } = params;

  const encoder = device.createCommandEncoder({ label });
  const afterSubmitCallbacks: Array<() => void> = [];
  const copyCommands: CopyCommand[] = [];
  let pass: {
    pass: GPUComputePassEncoder;
    queryIndex: number | null;
  } | null = null;

  const beginComputePass = (): GPUComputePassEncoder => {
    if (pass) return pass.pass;

    const descriptor: GPUComputePassDescriptor = {
      label: `${label}-compute-pass`,
    };

    let queryIndex: number | null = null;
    if (timestampManager) {
      queryIndex = timestampManager.injectTimestampWrites(descriptor);
    }

    const p = encoder.beginComputePass(descriptor);
    pass = { pass: p, queryIndex };
    return p;
  };

  const recordCopy = (
    src: GPUBuffer,
    srcOffset: number,
    dst: GPUBuffer,
    dstOffset: number,
    size: number,
  ): void => {
    copyCommands.push({ src, srcOffset, dst, dstOffset, size });
  };

  const recordAfterSubmit = (cb: () => void): void => {
    afterSubmitCallbacks.push(cb);
  };

  const finish = (): { commandBuffer: GPUCommandBuffer; afterSubmit?: () => void } => {
    if (pass) {
      try {
        pass.pass.end();
      } catch {}
    }

    for (const c of copyCommands) {
      encoder.copyBufferToBuffer(c.src, c.srcOffset, c.dst, c.dstOffset, c.size);
    }

    const commandBuffer = encoder.finish();

    const queryIndex = pass?.queryIndex ?? null;
    const afterSubmit =
      afterSubmitCallbacks.length || (timestampManager && queryIndex !== null)
        ? () => {
            for (const cb of afterSubmitCallbacks) {
              try {
                cb();
              } catch {}
            }

            if (timestampManager && queryIndex !== null && timestampManager.hasSupport()) {
              timestampManager.resolveAndReadback(encoder, queryIndex).catch(() => {});
            }
          }
        : undefined;

    return { commandBuffer, afterSubmit };
  };

  return { beginComputePass, recordCopy, recordAfterSubmit, finish };
}
