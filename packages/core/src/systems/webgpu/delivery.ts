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
          console.warn(
            '[GPUResultApplySystem] No channel mapping for archetype, using default mapping in dev',
            p.archetypeId,
          );
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

        // Handle primitive renderer (single channel)
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

        // DOM/Object: apply channel mapping
        for (const channelMap of channelsResolved) {
          const valueIndex = base + channelMap.index;
          if (valueIndex < valuesLen) {
            let value = values[valueIndex];
            // Apply optional transform when provided by packet or registry
            if (typeof channelMap.transform === 'function') {
              try {
                value = channelMap.transform(value);
              } catch (e) {
                // Swallow transform errors to avoid breaking delivery path
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
      }
    }
  },
};
