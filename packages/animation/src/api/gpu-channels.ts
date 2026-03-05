import { registerGPUChannelMappingForTracks } from '@g-motion/webgpu';
import type { TimelineData } from '@g-motion/core';
import type { VisualTarget } from './visual-target';
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

    if (targetType === TargetType.Primitive) {
      registerGPUChannelMappingForTracks({
        batchId: archetypeId,
        mode: 'primitive',
        trackKeys: tracks.keys(),
        canUseGPU: (property) => visualTarget.canUseGPU(property),
      });
      return;
    }

    if (targetType !== TargetType.DOM && targetType !== TargetType.Object) {
      return;
    }

    registerGPUChannelMappingForTracks({
      batchId: archetypeId,
      mode: 'visual',
      trackKeys: tracks.keys(),
      canUseGPU: (property) => visualTarget.canUseGPU(property),
    });
  }
}
