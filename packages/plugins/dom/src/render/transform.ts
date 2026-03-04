import { EXCLUDED_STYLE_KEYS } from '@g-motion/shared';
import type { TransformTypedBuffers } from '@g-motion/shared';

export type { TransformTypedBuffers };

export type TransformTyped = {
  index: number;
  buffers: TransformTypedBuffers;
};

export type TransformResolvedValues = {
  tx?: number;
  ty?: number;
  tz?: number;
  perspective?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  rotate?: number;
  sx?: number;
  sy?: number;
  sz?: number;
};

export const excludedStyleKeys: Record<string, true> = EXCLUDED_STYLE_KEYS;

export function resolveTransformValues(
  transform: any,
  typed?: TransformTyped,
): TransformResolvedValues {
  const index = typed?.index ?? -1;
  const buffers = typed?.buffers;

  const tx = buffers?.x
    ? buffers.x[index]
    : buffers?.translateX
      ? buffers.translateX[index]
      : (transform?.x ?? transform?.translateX ?? undefined);
  const ty = buffers?.y
    ? buffers.y[index]
    : buffers?.translateY
      ? buffers.translateY[index]
      : (transform?.y ?? transform?.translateY ?? undefined);
  const tz = buffers?.z
    ? buffers.z[index]
    : buffers?.translateZ
      ? buffers.translateZ[index]
      : (transform?.z ?? transform?.translateZ ?? undefined);
  const perspective = buffers?.perspective
    ? buffers.perspective[index]
    : (transform?.perspective ?? undefined);
  const rx = buffers?.rotateX ? buffers.rotateX[index] : (transform?.rotateX ?? undefined);
  const ry = buffers?.rotateY ? buffers.rotateY[index] : (transform?.rotateY ?? undefined);
  const rz = buffers?.rotateZ ? buffers.rotateZ[index] : (transform?.rotateZ ?? undefined);
  const rotate = buffers?.rotate ? buffers.rotate[index] : (transform?.rotate ?? undefined);
  const sx = buffers?.scaleX
    ? buffers.scaleX[index]
    : buffers?.scale
      ? buffers.scale[index]
      : (transform?.scaleX ?? transform?.scale ?? undefined);
  const sy = buffers?.scaleY
    ? buffers.scaleY[index]
    : buffers?.scale
      ? buffers.scale[index]
      : (transform?.scaleY ?? transform?.scale ?? undefined);
  const sz = buffers?.scaleZ
    ? buffers.scaleZ[index]
    : buffers?.scale
      ? buffers.scale[index]
      : (transform?.scaleZ ?? transform?.scale ?? undefined);

  return {
    tx,
    ty,
    tz,
    perspective,
    rx,
    ry,
    rz,
    rotate,
    sx,
    sy,
    sz,
  };
}

export function buildTransformString(
  tx?: number,
  ty?: number,
  tz?: number,
  perspective?: number,
  rx?: number,
  ry?: number,
  rz?: number,
  rotate?: number,
  sx?: number,
  sy?: number,
  sz?: number,
  forceGPU = true,
): string {
  const needs3d =
    forceGPU ||
    (tz ?? 0) !== 0 ||
    (rx ?? 0) !== 0 ||
    (ry ?? 0) !== 0 ||
    (rz ?? 0) !== 0 ||
    (perspective ?? 0) !== 0 ||
    (sz ?? 1) !== 1;

  let out = '';

  if (needs3d && (perspective ?? 0) !== 0) {
    out += `perspective(${perspective ?? 0}px)`;
  }

  if (needs3d) {
    if (forceGPU || (tx ?? 0) !== 0 || (ty ?? 0) !== 0 || (tz ?? 0) !== 0) {
      if (out) out += ' ';
      out += `translate3d(${tx ?? 0}px,${ty ?? 0}px,${tz ?? 0}px)`;
    }
  } else if ((tx ?? 0) !== 0 || (ty ?? 0) !== 0) {
    if (out) out += ' ';
    out += `translate(${tx ?? 0}px,${ty ?? 0}px)`;
  }

  if (needs3d) {
    if ((rx ?? 0) !== 0) {
      if (out) out += ' ';
      out += `rotateX(${rx ?? 0}deg)`;
    }
    if ((ry ?? 0) !== 0) {
      if (out) out += ' ';
      out += `rotateY(${ry ?? 0}deg)`;
    }

    const zRot = rz ?? rotate;
    if ((zRot ?? 0) !== 0) {
      if (out) out += ' ';
      out += `rotateZ(${zRot ?? 0}deg)`;
    }
  } else if ((rotate ?? 0) !== 0) {
    if (out) out += ' ';
    out += `rotate(${rotate ?? 0}deg)`;
  }

  if (needs3d) {
    const scaleZ = sz ?? 1;
    if ((sx ?? 1) !== 1 || (sy ?? 1) !== 1 || (scaleZ ?? 1) !== 1) {
      if (out) out += ' ';
      out += `scale3d(${sx ?? 1},${sy ?? 1},${scaleZ ?? 1})`;
    }
  } else if ((sx ?? 1) !== 1 || (sy ?? 1) !== 1) {
    if (out) out += ' ';
    out += `scale(${sx ?? 1},${sy ?? 1})`;
  }

  return out;
}
