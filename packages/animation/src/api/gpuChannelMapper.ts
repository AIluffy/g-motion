import {
  createBatchChannelTable,
  getGPUChannelMappingRegistry,
  OUTPUT_FORMAT,
} from '@g-motion/core';
import type { TimelineData } from '@g-motion/core';
import type { VisualTarget } from './visualTarget';
import { TargetType } from './mark';

export class GPUChannelMapper {
  registerChannels(params: {
    archetypeId: string;
    targetType: TargetType;
    tracks: TimelineData;
    visualTarget: VisualTarget;
  }): void {
    const { archetypeId, targetType, tracks, visualTarget } = params;
    if (tracks.size === 0) return;

    const registry = getGPUChannelMappingRegistry();

    if (targetType === TargetType.Primitive) {
      if (tracks.has('__primitive') && visualTarget.canUseGPU('__primitive')) {
        registry.registerBatchChannels({
          batchId: archetypeId,
          rawStride: 1,
          rawChannels: [{ index: 0, property: '__primitive' }],
          stride: 1,
          channels: [{ index: 0, property: '__primitive', formatType: OUTPUT_FORMAT.FLOAT }],
        });
      }
      return;
    }

    if (targetType !== TargetType.DOM && targetType !== TargetType.Object) {
      return;
    }

    const properties: string[] = [];
    for (const key of tracks.keys()) {
      if (key === '__primitive') continue;
      properties.push(key);
    }
    if (!properties.length) return;

    const gpuProps = properties.filter((prop) => visualTarget.canUseGPU(prop));
    if (!gpuProps.length) return;

    const standardTransformProps = ['x', 'y', 'rotate', 'scaleX', 'scaleY', 'opacity'];
    const canUsePackedTransform =
      gpuProps.length === standardTransformProps.length &&
      standardTransformProps.every((p) => gpuProps.includes(p));

    if (canUsePackedTransform) {
      const rawChannels = standardTransformProps.map((prop, idx) => ({
        index: idx,
        property: prop,
      }));
      const channels = [
        {
          index: 0,
          property: '__packed0',
          sourceIndex: 0,
          formatType: OUTPUT_FORMAT.PACKED_HALF2,
          packedProps: ['x', 'y'] as [string, string],
        },
        {
          index: 1,
          property: '__packed1',
          sourceIndex: 2,
          formatType: OUTPUT_FORMAT.PACKED_HALF2,
          packedProps: ['rotate', 'scaleX'] as [string, string],
        },
        {
          index: 2,
          property: '__packed2',
          sourceIndex: 4,
          formatType: OUTPUT_FORMAT.PACKED_HALF2,
          packedProps: ['scaleY', 'opacity'] as [string, string],
        },
      ];
      registry.registerBatchChannels({
        batchId: archetypeId,
        rawStride: rawChannels.length,
        rawChannels,
        stride: channels.length,
        channels,
      });
      return;
    }

    const table = createBatchChannelTable(archetypeId, gpuProps.length, gpuProps);
    for (const ch of table.channels) {
      switch (ch.property) {
        case 'rotate':
        case 'rotateX':
        case 'rotateY':
        case 'rotateZ':
          ch.formatType = OUTPUT_FORMAT.ANGLE_DEG;
          break;
        case 'opacity':
          ch.formatType = OUTPUT_FORMAT.COLOR_NORM;
          ch.minValue = 0;
          ch.maxValue = 1;
          break;
        default:
          ch.formatType = OUTPUT_FORMAT.FLOAT;
          break;
      }
    }
    registry.registerBatchChannels(table);
  }
}
