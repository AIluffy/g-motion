import type { SystemContext, SystemDef } from '../../plugin';
import { drainGPUResults } from '../../webgpu/sync-manager';
import { getGPUChannelMappingRegistry } from '../../webgpu/channel-mapping';
import type { ChannelMapping } from '../../webgpu/channel-mapping';
import { isDev } from '@g-motion/utils';
import { getRendererCode } from '../../renderer-code';

export const GPUResultApplySystem: SystemDef = {
  name: 'GPUResultApplySystem',
  order: 28, // before RenderSystem
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) return;
    const packets = drainGPUResults();
    if (!packets.length) return;
    const channelRegistry = getGPUChannelMappingRegistry();
    const primitiveCode = getRendererCode('primitive');

    for (const p of packets) {
      const { entityIds, values, stride: packetStride, channels: packetChannels } = p;
      const count = entityIds.length;
      if (count === 0 || values.length === 0) continue;

      let stride = packetStride ?? 1;
      let channelsResolved: ChannelMapping[] | undefined = undefined;

      if (!channelsResolved && packetChannels) {
        channelsResolved = packetChannels.map((c) => ({ index: c.index, property: c.property }));
      }

      if (!channelsResolved) {
        const table = channelRegistry.getChannels(p.archetypeId);
        if (table) {
          stride = table.stride;
          channelsResolved = table.channels;
        }
      }

      if (!channelsResolved) {
        if (isDev()) {
          const defaultChannels: ChannelMapping[] = [
            { index: 0, property: 'x' },
            { index: 1, property: 'y' },
            { index: 2, property: 'rotateX' },
            { index: 3, property: 'rotateY' },
            { index: 4, property: 'translateZ' },
          ];
          channelsResolved = defaultChannels;
          // eslint-disable-next-line no-console
        } else {
          channelsResolved = [];
        }
      }

      // Apply values to entities using channel mapping
      const valuesLen = values.length;
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
          if (rendererCode === primitiveCode || render.rendererId === 'primitive' || stride === 1) {
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

          for (const channelMap of channelsResolved) {
            const valueIndex = base + channelMap.index;
            if (valueIndex < valuesLen) {
              let value = values[valueIndex];
              if (typeof channelMap.transform === 'function') {
                try {
                  value = channelMap.transform(value);
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.warn('[GPUResultApplySystem] Channel transform error', e);
                }
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
          continue;
        }

        for (const channelMap of channelsResolved) {
          const valueIndex = base + channelMap.index;
          if (valueIndex < valuesLen) {
            let value = values[valueIndex];
            if (typeof channelMap.transform === 'function') {
              try {
                value = channelMap.transform(value);
              } catch (e) {
                console.warn('[GPUResultApplySystem] Channel transform error', e);
              }
            }
            const writeTransform = (prop: string) => {
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

            writeTransform(channelMap.property);

            if (channelMap.property === 'translateX') {
              writeTransform('x');
            } else if (channelMap.property === 'translateY') {
              writeTransform('y');
            } else if (channelMap.property === 'translateZ') {
              writeTransform('z');
            } else if (channelMap.property === 'scale') {
              writeTransform('scaleX');
              writeTransform('scaleY');
              writeTransform('scaleZ');
            } else if (channelMap.property === 'rotate') {
              writeTransform('rotateZ');
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
      }
    }
  },
};
