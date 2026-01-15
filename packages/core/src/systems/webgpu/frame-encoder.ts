import type { TimingHelper } from '../../webgpu/timing-helper';

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
  timingHelper: TimingHelper | null;
  label: string;
}): WebGPUFrameEncoder {
  const { device, timingHelper, label } = params;

  const encoder = device.createCommandEncoder({ label });
  const afterSubmitCallbacks: Array<() => void> = [];
  const copyCommands: CopyCommand[] = [];
  let pass: {
    pass: GPUComputePassEncoder;
    token: unknown | null;
  } | null = null;

  const beginComputePass = (): GPUComputePassEncoder => {
    if (pass) return pass.pass;
    if (timingHelper) {
      const res = timingHelper.beginComputePassWithToken(encoder);
      pass = { pass: res.pass, token: res.token };
      return res.pass;
    }
    const p = encoder.beginComputePass();
    pass = { pass: p, token: null };
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

    const token = pass?.token ?? null;
    const afterSubmit =
      afterSubmitCallbacks.length || (timingHelper && token)
        ? () => {
            for (const cb of afterSubmitCallbacks) {
              try {
                cb();
              } catch {}
            }

            if (timingHelper && token && timingHelper.hasTimestampSupport()) {
              timingHelper.getResultForToken(token as any).catch(() => {});
            }
          }
        : undefined;

    return { commandBuffer, afterSubmit };
  };

  return { beginComputePass, recordCopy, recordAfterSubmit, finish };
}
