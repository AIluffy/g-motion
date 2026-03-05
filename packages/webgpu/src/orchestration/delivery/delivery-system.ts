/**
 * GPU Result Delivery System
 *
 * Applies GPU-computed animation values to entities.
 * Handles primitive values, transform matrices, and channel-specific formats.
 */

import type { SystemContext, SystemDef } from '@g-motion/core/runtime';
import type { GPUResultPacket } from '../../bridge/types';
import { getGPUModuleSync } from '../../bridge';
import type { ChannelMapping } from '../../bridge/types';
import { createDebugger, isDev } from '@g-motion/shared';
import { getRendererCode } from '@g-motion/core';
import { applyGPUResultPacket } from './apply-results';

const s_gpuResultPacketsScratch: GPUResultPacket[] = [];
const warn = createDebugger('GPUResultApplySystem', 'warn');

export const GPUResultApplySystem: SystemDef = {
  name: 'GPUResultApplySystem',
  order: 28,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) return;
    const gpu = getGPUModuleSync();
    if (!gpu) return;

    s_gpuResultPacketsScratch.length = 0;
    gpu.drainGPUResultsInto?.(s_gpuResultPacketsScratch);
    if (!s_gpuResultPacketsScratch.length) return;

    const packets = s_gpuResultPacketsScratch;

    const channelRegistry = gpu.getGPUChannelMappingRegistry();
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
        const isStandardTransform = gpu.isStandardTransformChannels(channelsResolved);
        const isMatrix2D = gpu.isMatrix2DTransformChannels(channelsResolved);
        const isMatrix3D = gpu.isMatrix3DTransformChannels(channelsResolved);

        if (isPrimitiveChannels && stride !== 1) {
          warn('GPU result packet has primitive channel mapping but stride is not 1.', {
            archetypeId: p.archetypeId,
            stride,
            channelCount: channelsResolved.length,
          });
        }

        if (stride === 1 && (channelsResolved.length !== 1 || channelsResolved[0]!.index !== 0)) {
          warn(
            'GPU result packet uses stride=1 but channel mapping is not a single channel at index 0.',
            {
              archetypeId: p.archetypeId,
              stride,
              channelCount: channelsResolved.length,
              channels: channelsResolved,
            },
          );
        }

        if (isStandardTransform && stride !== channelsResolved.length) {
          warn(
            'GPU result packet has standard transform channel mapping but stride does not match channel count.',
            {
              archetypeId: p.archetypeId,
              stride,
              channelCount: channelsResolved.length,
            },
          );
        }

        if (isMatrix2D && stride !== 6) {
          warn('GPU result packet has matrix2d channel mapping but stride is not 6.', {
            archetypeId: p.archetypeId,
            stride,
            channelCount: channelsResolved.length,
          });
        }

        if (isMatrix3D && stride !== 16) {
          warn('GPU result packet has matrix3d channel mapping but stride is not 16.', {
            archetypeId: p.archetypeId,
            stride,
            channelCount: channelsResolved.length,
          });
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

      applyGPUResultPacket({
        world,
        packet: p,
        channelsResolved,
        stride,
        primitiveCode,
        finished,
      });
    }
  },
};
