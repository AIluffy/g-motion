import type { SystemContext, SystemDef } from '../../plugin';
import { MotionStatus } from '../../components/state';
import { drainGPUResults, unmarkPhysicsGPUEntity } from '../../webgpu/sync-manager';
import {
  getGPUChannelMappingRegistry,
  isMatrix2DTransformChannels,
  isMatrix3DTransformChannels,
  isStandardTransformChannels,
} from '../../webgpu/channel-mapping';
import type { ChannelMapping } from '../../webgpu/channel-mapping';
import { OUTPUT_FORMAT, packedRGBAToCSS, unpackHalf2 } from '../../webgpu/output-format-shader';
import { isDev } from '@g-motion/utils';
import { getRendererCode } from '../../renderer-code';
import { MotionError, ErrorCode, ErrorSeverity } from '../../errors';

function buildMatrix2DTransformString(
  values: Float32Array,
  base: number,
  stride: number,
  channelIndices: number[],
): string | null {
  if (stride <= 0) return null;
  if (channelIndices.length !== 6) return null;
  const maxIndex = Math.max(
    channelIndices[0],
    channelIndices[1],
    channelIndices[2],
    channelIndices[3],
    channelIndices[4],
    channelIndices[5],
  );
  const end = base + maxIndex;
  if (end < 0 || end >= values.length) return null;

  const a = values[base + channelIndices[0]];
  const b = values[base + channelIndices[1]];
  const c = values[base + channelIndices[2]];
  const d = values[base + channelIndices[3]];
  const e = values[base + channelIndices[4]];
  const f = values[base + channelIndices[5]];
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(c) ||
    !Number.isFinite(d) ||
    !Number.isFinite(e) ||
    !Number.isFinite(f)
  ) {
    return null;
  }
  return `matrix(${a},${-b},${-c},${d},${e},${f})`;
}

function buildMatrix3DTransformString(
  values: Float32Array,
  base: number,
  stride: number,
  channelIndices: number[],
): string | null {
  if (stride <= 0) return null;
  if (channelIndices.length !== 16) return null;
  let maxIndex = 0;
  for (let i = 0; i < 16; i++) {
    maxIndex = Math.max(maxIndex, channelIndices[i] ?? 0);
  }
  const end = base + maxIndex;
  if (end < 0 || end >= values.length) return null;

  const parts: string[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    const v = values[base + channelIndices[i]];
    if (!Number.isFinite(v)) return null;
    parts[i] = String(v);
  }
  return `matrix3d(${parts.join(',')})`;
}

export const GPUResultApplySystem: SystemDef = {
  name: 'GPUResultApplySystem',
  order: 28, // before RenderSystem
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    const errorHandler = ctx?.services.errorHandler;
    if (!world) return;
    const packets = drainGPUResults();
    if (!packets.length) return;
    const channelRegistry = getGPUChannelMappingRegistry();
    const primitiveCode = getRendererCode('primitive');

    for (const p of packets) {
      const { entityIds, values, stride: packetStride, channels: packetChannels } = p;
      const finished = (p as any).finished as Uint32Array | undefined;
      const count = entityIds.length;
      if (count === 0 || values.length === 0) continue;

      let stride = packetStride ?? 1;
      let channelsResolved: ChannelMapping[] | undefined = undefined;

      if (!channelsResolved && packetChannels) {
        channelsResolved = packetChannels as unknown as ChannelMapping[];
      }

      if (!channelsResolved) {
        const table = channelRegistry.getChannels(p.archetypeId);
        if (table) {
          const tableRawStride = table.rawStride ?? table.rawChannels?.length;
          if (
            packetStride !== undefined &&
            tableRawStride !== undefined &&
            packetStride === tableRawStride &&
            table.rawChannels &&
            table.rawChannels.length
          ) {
            stride = packetStride;
            channelsResolved = table.rawChannels;
          } else {
            stride = table.stride;
            channelsResolved = table.channels;
          }
        }
      }

      if (channelsResolved && channelsResolved.length) {
        const isPrimitiveChannels =
          channelsResolved.length === 1 && channelsResolved[0].property === '__primitive';
        const hasNonPrimitiveProp = channelsResolved.some((c) => c.property !== '__primitive');
        const isStandardTransform = isStandardTransformChannels(channelsResolved);
        const isMatrix2D = isMatrix2DTransformChannels(channelsResolved);
        const isMatrix3D = isMatrix3DTransformChannels(channelsResolved);

        if (isPrimitiveChannels && stride !== 1 && errorHandler) {
          const error = new MotionError(
            'GPU result packet has primitive channel mapping but stride is not 1.',
            ErrorCode.BATCH_VALIDATION_FAILED,
            ErrorSeverity.WARNING,
            {
              archetypeId: p.archetypeId,
              stride,
              channelCount: channelsResolved.length,
            },
          );
          errorHandler.handle(error);
        }

        if (hasNonPrimitiveProp && stride === 1 && errorHandler) {
          const error = new MotionError(
            'GPU result packet uses stride=1 but channel mapping includes non-primitive properties.',
            ErrorCode.BATCH_VALIDATION_FAILED,
            ErrorSeverity.WARNING,
            {
              archetypeId: p.archetypeId,
              stride,
              channelCount: channelsResolved.length,
              properties: channelsResolved.map((c) => c.property),
            },
          );
          errorHandler.handle(error);
        }

        if (isStandardTransform && stride !== channelsResolved.length && errorHandler) {
          const error = new MotionError(
            'GPU result packet has standard transform channel mapping but stride does not match channel count.',
            ErrorCode.BATCH_VALIDATION_FAILED,
            ErrorSeverity.WARNING,
            {
              archetypeId: p.archetypeId,
              stride,
              channelCount: channelsResolved.length,
            },
          );
          errorHandler.handle(error);
        }

        if (isMatrix2D && stride !== 6 && errorHandler) {
          const error = new MotionError(
            'GPU result packet has matrix2d channel mapping but stride is not 6.',
            ErrorCode.BATCH_VALIDATION_FAILED,
            ErrorSeverity.WARNING,
            {
              archetypeId: p.archetypeId,
              stride,
              channelCount: channelsResolved.length,
            },
          );
          errorHandler.handle(error);
        }

        if (isMatrix3D && stride !== 16 && errorHandler) {
          const error = new MotionError(
            'GPU result packet has matrix3d channel mapping but stride is not 16.',
            ErrorCode.BATCH_VALIDATION_FAILED,
            ErrorSeverity.WARNING,
            {
              archetypeId: p.archetypeId,
              stride,
              channelCount: channelsResolved.length,
            },
          );
          errorHandler.handle(error);
        }
      }

      if (!channelsResolved) {
        if (p.archetypeId.includes('::primitive')) {
          channelsResolved = [{ index: 0, property: '__primitive' }];
        }
      }

      if (!channelsResolved) {
        if (isDev()) {
          const defaultChannels: ChannelMapping[] = [
            { index: 0, property: 'x' },
            { index: 1, property: 'y' },
            { index: 2, property: 'rotate' },
            { index: 3, property: 'scaleX' },
            { index: 4, property: 'scaleY' },
            { index: 5, property: 'opacity' },
          ];
          channelsResolved = defaultChannels;
        } else {
          channelsResolved = [];
        }
      }

      // Apply values to entities using channel mapping
      const valuesLen = values.length;
      const valuesU32 =
        valuesLen > 0 ? new Uint32Array(values.buffer, values.byteOffset, valuesLen) : undefined;
      const firstId = entityIds[0];
      const packetArchetype = firstId != null ? world.getEntityArchetype(firstId) : undefined;
      const stableArchetype =
        packetArchetype && packetArchetype.id === p.archetypeId ? packetArchetype : undefined;
      const stableRenderBuffer = stableArchetype ? stableArchetype.getBuffer('Render') : undefined;
      const stableIndices = stableArchetype
        ? (stableArchetype as any).getInternalEntityIndices?.()
        : undefined;
      const stableTypedRendererCode = stableArchetype
        ? stableArchetype.getTypedBuffer('Render', 'rendererCode')
        : undefined;

      const isMatrix2DChannels = isMatrix2DTransformChannels(channelsResolved);
      const isMatrix3DChannels = isMatrix3DTransformChannels(channelsResolved);
      const matrix2dChannelIndices = isMatrix2DChannels
        ? channelsResolved.map((c) => c.index)
        : undefined;
      const matrix3dChannelIndices = isMatrix3DChannels
        ? channelsResolved.map((c) => c.index)
        : undefined;

      for (let i = 0; i < count; i++) {
        const id = entityIds[i];
        const archetype = stableArchetype ?? world.getEntityArchetype(id);
        if (!archetype) continue;
        if (typeof (archetype as any).getBuffer !== 'function') {
          const render = (archetype as any).getEntityData?.(id, 'Render');
          if (!render) continue;

          let changed = false;
          if (!render.props) {
            render.props = {};
            changed = true;
          }

          const rendererCode = render.rendererCode ?? 0;
          const base = i * stride;
          const isPrimitiveRenderer =
            rendererCode === primitiveCode || render.rendererId === 'primitive';
          const isPrimitivePacket = p.archetypeId.includes('::primitive');
          const hasNonPrimitiveProp = channelsResolved.some((c) => c.property !== '__primitive');
          if (isPrimitiveRenderer || (isPrimitivePacket && stride === 1 && !hasNonPrimitiveProp)) {
            const next = values[base];
            if (!Object.is(render.props.__primitive, next)) {
              render.props.__primitive = next;
              changed = true;
            }
            if (changed) {
              render.version = (render.version ?? 0) + 1;
            }
            continue;
          }

          if (isMatrix2DChannels && matrix2dChannelIndices) {
            const css = buildMatrix2DTransformString(values, base, stride, matrix2dChannelIndices);
            if (css !== null) {
              const prev = render.props.transform;
              if (!Object.is(prev, css)) {
                render.props.transform = css;
                changed = true;
              }
              if (changed) {
                render.version = (render.version ?? 0) + 1;
              }
              continue;
            }
          }

          if (isMatrix3DChannels && matrix3dChannelIndices) {
            const css = buildMatrix3DTransformString(values, base, stride, matrix3dChannelIndices);
            if (css !== null) {
              const prev = render.props.transform;
              if (!Object.is(prev, css)) {
                render.props.transform = css;
                changed = true;
              }
              if (changed) {
                render.version = (render.version ?? 0) + 1;
              }
              continue;
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
                  index: i,
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
                console.warn('[GPUResultApplySystem] Channel transform error', e);
              }
            }
            if (typeof channelMap.unpackAndAssign === 'function') {
              channelMap.unpackAndAssign(value, {
                render,
                index: i,
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

          if (changed) {
            render.version = (render.version ?? 0) + 1;
          }
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
        const rendererCode = typedRendererCode
          ? typedRendererCode[index]
          : (render.rendererCode ?? 0);

        let changed = false;
        if (!render.props) {
          render.props = {};
          changed = true;
        }

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
          if (stateBuffer && index !== undefined) {
            const state = stateBuffer[index] as any;
            state.status = MotionStatus.Finished;
            if (typedStatus) {
              typedStatus[index] = MotionStatus.Finished as unknown as number;
            }
          }
          unmarkPhysicsGPUEntity(id);
        };
        if (
          (rendererCode === primitiveCode || render.rendererId === 'primitive' || stride === 1) &&
          !channelsResolved.some((c) => c.property !== '__primitive')
        ) {
          const next = values[base];
          if (!Object.is(render.props.__primitive, next)) {
            render.props.__primitive = next;
            changed = true;
          }
          if (changed) {
            render.version = (render.version ?? 0) + 1;
          }
          maybeFinish();
          continue;
        }

        if (isMatrix2DChannels && matrix2dChannelIndices) {
          const css = buildMatrix2DTransformString(values, base, stride, matrix2dChannelIndices);
          if (css !== null) {
            const prev = render.props.transform;
            if (!Object.is(prev, css)) {
              render.props.transform = css;
              changed = true;
            }
            if (changed) {
              render.version = (render.version ?? 0) + 1;
            }
            maybeFinish();
            continue;
          }
        }

        if (isMatrix3DChannels && matrix3dChannelIndices) {
          const css = buildMatrix3DTransformString(values, base, stride, matrix3dChannelIndices);
          if (css !== null) {
            const prev = render.props.transform;
            if (!Object.is(prev, css)) {
              render.props.transform = css;
              changed = true;
            }
            if (changed) {
              render.version = (render.version ?? 0) + 1;
            }
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
                console.warn('[GPUResultApplySystem] Channel transform error', e);
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

        if (changed) {
          render.version = (render.version ?? 0) + 1;
        }
        maybeFinish();
      }
    }
  },
};
