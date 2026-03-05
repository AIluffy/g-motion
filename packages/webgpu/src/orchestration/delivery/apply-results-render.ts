import { createDebugger } from '@g-motion/shared';
import type { ChannelMapping, GPUResultPacket } from '../../bridge/types';
import {
  buildMatrix2DTransformString,
  buildMatrix3DTransformString,
  OUTPUT_FORMAT,
  packedRGBAToCSS,
  unpackHalf2,
} from './transform-utils';

export const warn = createDebugger('GPUResultApplySystem', 'warn');

export const ensureRenderProps = (render: any): boolean => {
  if (!render.props) {
    render.props = {};
    return true;
  }
  return false;
};

export const bumpRenderVersion = (render: any, changed: boolean): void => {
  if (changed) {
    render.version = (render.version ?? 0) + 1;
  }
};

export const applyPrimitiveValue = (render: any, next: number, changed: boolean): boolean => {
  if (!Object.is(render.props.__primitive, next)) {
    render.props.__primitive = next;
    return true;
  }
  return changed;
};

export const applyMatrixTransform = (
  render: any,
  css: string | null,
  changed: boolean,
): boolean => {
  if (css === null) return changed;
  const prev = render.props.transform;
  if (!Object.is(prev, css)) {
    render.props.transform = css;
    return true;
  }
  return changed;
};

export function applyResultToRenderProps(params: {
  render: any;
  packet: GPUResultPacket;
  channelsResolved: ChannelMapping[];
  stride: number;
  primitiveCode: number;
  index: number;
  valuesLen: number;
  valuesU32?: Uint32Array;
  isMatrix2DChannels: boolean;
  isMatrix3DChannels: boolean;
  matrix2dChannelIndices?: number[];
  matrix3dChannelIndices?: number[];
  packetHasNonPrimitiveProp: boolean;
}): void {
  const {
    render,
    packet,
    channelsResolved,
    stride,
    primitiveCode,
    index,
    valuesLen,
    valuesU32,
    isMatrix2DChannels,
    isMatrix3DChannels,
    matrix2dChannelIndices,
    matrix3dChannelIndices,
    packetHasNonPrimitiveProp,
  } = params;
  const { values } = packet;

  let changed = ensureRenderProps(render);

  const rendererCode = render.rendererCode ?? 0;
  const base = index * stride;
  const isPrimitiveRenderer = rendererCode === primitiveCode || render.rendererId === 'primitive';
  const isPrimitivePacket = packet.archetypeId.includes('::primitive');
  if (isPrimitiveRenderer || (isPrimitivePacket && stride === 1 && !packetHasNonPrimitiveProp)) {
    const next = values[base];
    changed = applyPrimitiveValue(render, next, changed);
    bumpRenderVersion(render, changed);
    return;
  }

  if (isMatrix2DChannels && matrix2dChannelIndices) {
    const css = buildMatrix2DTransformString(values, base, stride, matrix2dChannelIndices);
    if (css !== null) {
      changed = applyMatrixTransform(render, css, changed);
      bumpRenderVersion(render, changed);
      return;
    }
  }

  if (isMatrix3DChannels && matrix3dChannelIndices) {
    const css = buildMatrix3DTransformString(values, base, stride, matrix3dChannelIndices);
    if (css !== null) {
      changed = applyMatrixTransform(render, css, changed);
      bumpRenderVersion(render, changed);
      return;
    }
  }

  for (const channelMap of channelsResolved) {
    const valueIndex = base + channelMap.index;
    if (valueIndex >= valuesLen) continue;

    if (channelMap.formatType === OUTPUT_FORMAT.COLOR_RGBA && valuesU32) {
      const packed = valuesU32[valueIndex] >>> 0;
      const css = packedRGBAToCSS(packed);
      const prev = render.props[channelMap.property];
      if (!Object.is(prev, css)) {
        render.props[channelMap.property] = css;
        changed = true;
      }
      continue;
    }

    if (channelMap.formatType === OUTPUT_FORMAT.PACKED_HALF2 && valuesU32) {
      const packed = valuesU32[valueIndex] >>> 0;
      if (channelMap.packedProps) {
        const [a, b] = unpackHalf2(packed);
        const prevA = render.props[channelMap.packedProps[0]];
        if (!Object.is(prevA, a)) {
          render.props[channelMap.packedProps[0]] = a;
          changed = true;
        }
        const prevB = render.props[channelMap.packedProps[1]];
        if (!Object.is(prevB, b)) {
          render.props[channelMap.packedProps[1]] = b;
          changed = true;
        }
        continue;
      }
      if (typeof channelMap.unpackAndAssign === 'function') {
        channelMap.unpackAndAssign(packed, {
          render,
          index,
          values,
          valuesU32,
          stride,
          base,
          valuesLen,
          channel: channelMap,
        });
        changed = true;
        continue;
      }
    }

    let value = values[valueIndex];
    if (typeof channelMap.transform === 'function') {
      try {
        value = channelMap.transform(value);
      } catch (e) {
        warn('Channel transform error', e);
      }
    }
    if (typeof channelMap.unpackAndAssign === 'function') {
      channelMap.unpackAndAssign(value, {
        render,
        index,
        values,
        valuesU32,
        stride,
        base,
        valuesLen,
        channel: channelMap,
      });
      changed = true;
      continue;
    }
    const prev = render.props[channelMap.property];
    if (!Object.is(prev, value)) {
      render.props[channelMap.property] = value;
      changed = true;
    }
  }

  bumpRenderVersion(render, changed);
}
