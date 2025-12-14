import { WorldProvider } from '../../worldProvider';
import type { SystemDef } from '../../plugin';
import { drainGPUResults } from '../../webgpu/sync-manager';
import { getGPUChannelMappingRegistry } from '../../webgpu/channel-mapping';
import type { ChannelMapping } from '../../webgpu/channel-mapping';

export const GPUResultApplySystem: SystemDef = {
  name: 'GPUResultApplySystem',
  order: 28, // before RenderSystem
  update() {
    const world = WorldProvider.useWorld();
    const packets = drainGPUResults();
    if (!packets.length) return;

    const channelRegistry = getGPUChannelMappingRegistry();

    for (const p of packets) {
      const { entityIds, values, stride: packetStride, channels: packetChannels } = p;
      const count = entityIds.length;
      if (count === 0 || values.length === 0) continue;

      // Determine stride and channels from packet or registry
      let stride = packetStride ?? 1;
      let channelsResolved: ChannelMapping[] | undefined = undefined;

      // If no channel mapping in packet, consult registry
      if (!channelsResolved && packetChannels) {
        // Normalize packet channels into ChannelMapping (no transform in packet)
        channelsResolved = packetChannels.map((c) => ({ index: c.index, property: c.property }));
      }

      if (!channelsResolved) {
        const table = channelRegistry.getChannels(p.archetypeId);
        if (table) {
          stride = table.stride;
          channelsResolved = table.channels;
        }
      }

      // Fallback to default channels if still undefined
      if (!channelsResolved) {
        const defaultChannels: ChannelMapping[] = [
          { index: 0, property: 'x' },
          { index: 1, property: 'y' },
          { index: 2, property: 'rotateX' },
          { index: 3, property: 'rotateY' },
          { index: 4, property: 'translateZ' },
        ];
        channelsResolved = defaultChannels;
      }

      // Apply values to entities using channel mapping
      for (let i = 0; i < count; i++) {
        const id = entityIds[i];
        const archetype = (world as any).getEntityArchetype?.(id) ?? null;
        if (!archetype) continue;
        const render = archetype.getEntityData?.(id, 'Render');
        if (!render) continue;

        render.props ||= {};

        // Handle primitive renderer (single channel)
        if (render.rendererId === 'primitive' || stride === 1) {
          render.props.__primitive = values[i * stride];
          continue;
        }

        // DOM/Object: apply channel mapping
        for (const channelMap of channelsResolved) {
          const valueIndex = i * stride + channelMap.index;
          if (valueIndex < values.length) {
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
            render.props[channelMap.property] = value;
          }
        }
      }
    }
  },
};
