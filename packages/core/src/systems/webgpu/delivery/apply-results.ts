import type { ChannelMapping, GPUResultPacket } from '../../../gpu-bridge/types';
import { getGPUModuleSync } from '../../../gpu-bridge';
import { MotionStatus } from '../../../components/state';
import type { World } from '../../../runtime/world';
import {
  applyMatrixTransform,
  applyPrimitiveValue,
  applyResultToRenderProps,
  bumpRenderVersion,
  ensureRenderProps,
  warn,
} from './apply-results-render';
import {
  buildMatrix2DTransformString,
  buildMatrix3DTransformString,
  OUTPUT_FORMAT,
  packedRGBAToCSS,
  unpackHalf2,
} from './transform-utils';

export function applyGPUResultPacket(params: {
  world: World;
  packet: GPUResultPacket;
  channelsResolved: ChannelMapping[];
  stride: number;
  primitiveCode: number;
  finished?: Uint32Array;
}): void {
  const { world, packet, channelsResolved, stride, primitiveCode, finished } = params;
  const gpu = getGPUModuleSync();
  if (!gpu) return;
  const { entityIds, values } = packet;
  const valuesLen = values.length;
  const valuesU32 =
    valuesLen > 0 ? new Uint32Array(values.buffer, values.byteOffset, valuesLen) : undefined;
  const firstId = entityIds[0];
  const packetArchetype = firstId != null ? world.getEntityArchetype(firstId) : undefined;
  const stableArchetype =
    packetArchetype && packetArchetype.id === packet.archetypeId ? packetArchetype : undefined;
  const stableRenderBuffer = stableArchetype ? stableArchetype.getBuffer('Render') : undefined;
  const stableIndices = stableArchetype
    ? (stableArchetype as any).getInternalEntityIndices?.()
    : undefined;
  const stableTypedRendererCode = stableArchetype
    ? stableArchetype.getTypedBuffer('Render', 'rendererCode')
    : undefined;

  const isMatrix2DChannels = gpu.isMatrix2DTransformChannels(channelsResolved);
  const isMatrix3DChannels = gpu.isMatrix3DTransformChannels(channelsResolved);
  const packetHasNonPrimitiveProp = channelsResolved.some((c) => c.property !== '__primitive');
  const matrix2dChannelIndices = isMatrix2DChannels
    ? channelsResolved.map((c) => c.index)
    : undefined;
  const matrix3dChannelIndices = isMatrix3DChannels
    ? channelsResolved.map((c) => c.index)
    : undefined;

  const count = entityIds.length;
  for (let i = 0; i < count; i++) {
    const id = entityIds[i];
    const archetype = stableArchetype ?? world.getEntityArchetype(id);
    if (!archetype) continue;
    if (typeof (archetype as any).getBuffer !== 'function') {
      const render = (archetype as any).getEntityData?.(id, 'Render');
      if (!render) continue;
      applyResultToRenderProps({
        render,
        packet,
        channelsResolved,
        stride,
        primitiveCode,
        index: i,
        valuesLen,
        valuesU32,
        isMatrix2DChannels,
        isMatrix3DChannels,
        matrix2dChannelIndices,
        matrix3dChannelIndices,
        packetHasNonPrimitiveProp,
      });
      continue;
    }
    const renderBuffer = stableArchetype ? stableRenderBuffer : archetype.getBuffer('Render');
    if (!renderBuffer) continue;
    const indices = stableArchetype
      ? stableIndices
      : (archetype as any).getInternalEntityIndices?.();
    const index = indices ? indices.get(id) : undefined;
    if (index === undefined) continue;
    const render = renderBuffer[index] as any;
    if (!render) continue;
    const typedRendererCode = stableArchetype
      ? stableTypedRendererCode
      : archetype.getTypedBuffer?.('Render', 'rendererCode');
    const rendererCode = typedRendererCode ? typedRendererCode[index] : (render.rendererCode ?? 0);

    let changed = ensureRenderProps(render);

    const transformBuffer = archetype.getBuffer?.('Transform');
    const typedTransformBuffers: Record<
      string,
      Float32Array | Float64Array | Int32Array | undefined
    > = {};

    const base = i * stride;

    const maybeFinish = () => {
      if (!finished || stride <= 0) return;
      let allFinished = true;
      for (let c = 0; c < stride; c++) {
        if ((finished[base + c] ?? 0) !== 1) {
          allFinished = false;
          break;
        }
      }
      if (!allFinished) return;

      const stateBuffer = archetype.getBuffer?.('MotionState');
      const typedStatus = archetype.getTypedBuffer?.('MotionState', 'status') as
        | Int32Array
        | undefined;
      const springBuffer = archetype.getBuffer?.('Spring');
      const inertiaBuffer = archetype.getBuffer?.('Inertia');

      if (springBuffer && inertiaBuffer && index !== undefined) {
        const spring = springBuffer[index] as any;
        const inertia = inertiaBuffer[index] as any;

        if (spring && inertia) {
          if (spring.velocities instanceof Map) {
            if (!inertia.velocities || !(inertia.velocities instanceof Map)) {
              inertia.velocities = new Map();
            }
            for (const [key, v] of spring.velocities) {
              (inertia.velocities as Map<string, number>).set(key, v);
            }
          }

          springBuffer[index] = undefined;

          if (stateBuffer) {
            const state = stateBuffer[index] as any;
            state.status = MotionStatus.Running;
            if (typedStatus) {
              typedStatus[index] = MotionStatus.Running as unknown as number;
            }
          }

          gpu.unmarkPhysicsGPUEntity?.(id);
          return;
        }
      }

      if (stateBuffer && index !== undefined) {
        const state = stateBuffer[index] as any;
        state.status = MotionStatus.Finished;
        if (typedStatus) {
          typedStatus[index] = MotionStatus.Finished as unknown as number;
        }
      }
      gpu.unmarkPhysicsGPUEntity?.(id);
    };
    if (
      (rendererCode === primitiveCode || render.rendererId === 'primitive' || stride === 1) &&
      !packetHasNonPrimitiveProp
    ) {
      const next = values[base];
      changed = applyPrimitiveValue(render, next, changed);
      bumpRenderVersion(render, changed);
      maybeFinish();
      continue;
    }

    if (isMatrix2DChannels && matrix2dChannelIndices) {
      const css = buildMatrix2DTransformString(values, base, stride, matrix2dChannelIndices);
      if (css !== null) {
        changed = applyMatrixTransform(render, css, changed);
        bumpRenderVersion(render, changed);
        maybeFinish();
        continue;
      }
    }

    if (isMatrix3DChannels && matrix3dChannelIndices) {
      const css = buildMatrix3DTransformString(values, base, stride, matrix3dChannelIndices);
      if (css !== null) {
        changed = applyMatrixTransform(render, css, changed);
        bumpRenderVersion(render, changed);
        maybeFinish();
        continue;
      }
    }

    const writeTransformValue = (prop: string, value: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      if (transformBuffer && index !== undefined) {
        const t = transformBuffer[index] as any;
        if (t && !Object.is(t[prop], value)) {
          t[prop] = value;
        }
      }
      let tbuf = typedTransformBuffers[prop];
      if (tbuf === undefined) {
        tbuf = archetype.getTypedBuffer?.('Transform', prop) as
          | Float32Array
          | Float64Array
          | Int32Array
          | undefined;
        typedTransformBuffers[prop] = tbuf;
      }
      if (tbuf && index !== undefined) {
        tbuf[index] = value;
      }
    };

    for (const channelMap of channelsResolved) {
      const valueIndex = base + channelMap.index;
      if (valueIndex < valuesLen) {
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
            const propA = channelMap.packedProps[0];
            const propB = channelMap.packedProps[1];
            writeTransformValue(propA, a);
            writeTransformValue(propB, b);
            if (propA === 'translateX') writeTransformValue('x', a);
            else if (propA === 'translateY') writeTransformValue('y', a);
            else if (propA === 'translateZ') writeTransformValue('z', a);
            else if (propA === 'scale') {
              writeTransformValue('scaleX', a);
              writeTransformValue('scaleY', a);
              writeTransformValue('scaleZ', a);
            } else if (propA === 'rotate') {
              writeTransformValue('rotateZ', a);
            }
            if (propB === 'translateX') writeTransformValue('x', b);
            else if (propB === 'translateY') writeTransformValue('y', b);
            else if (propB === 'translateZ') writeTransformValue('z', b);
            else if (propB === 'scale') {
              writeTransformValue('scaleX', b);
              writeTransformValue('scaleY', b);
              writeTransformValue('scaleZ', b);
            } else if (propB === 'rotate') {
              writeTransformValue('rotateZ', b);
            }
            const prevA = render.props[propA];
            if (!Object.is(prevA, a)) {
              render.props[propA] = a;
              changed = true;
            }
            const prevB = render.props[propB];
            if (!Object.is(prevB, b)) {
              render.props[propB] = b;
              changed = true;
            }
            continue;
          }
          if (typeof channelMap.unpackAndAssign === 'function') {
            channelMap.unpackAndAssign(packed, {
              render,
              transformBuffer,
              typedTransformBuffers,
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
            transformBuffer,
            typedTransformBuffers,
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
        writeTransformValue(channelMap.property, value);

        if (channelMap.property === 'translateX') {
          writeTransformValue('x', value);
        } else if (channelMap.property === 'translateY') {
          writeTransformValue('y', value);
        } else if (channelMap.property === 'translateZ') {
          writeTransformValue('z', value);
        } else if (channelMap.property === 'scale') {
          writeTransformValue('scaleX', value);
          writeTransformValue('scaleY', value);
          writeTransformValue('scaleZ', value);
        } else if (channelMap.property === 'rotate') {
          writeTransformValue('rotateZ', value);
        }

        const prev = render.props[channelMap.property];
        if (!Object.is(prev, value)) {
          render.props[channelMap.property] = value;
          changed = true;
        }
      }
    }

    bumpRenderVersion(render, changed);
    maybeFinish();
  }
}
