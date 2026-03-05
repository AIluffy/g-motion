import type { TimelineData } from '@g-motion/core';
import type { VisualTarget } from './visual-target';
import { TargetType } from './mark';

type RegisterGPUChannelMappingForTracks = (params: {
  batchId: string;
  mode: 'primitive' | 'visual';
  trackKeys: IterableIterator<string>;
  canUseGPU: (property: string) => boolean;
}) => void;

let registerGPUChannelMappingForTracksFn: RegisterGPUChannelMappingForTracks | null = null;
let registerGPUChannelMappingForTracksLoadPromise:
  | Promise<RegisterGPUChannelMappingForTracks | null>
  | null = null;

const pendingRegistrations: Array<Parameters<RegisterGPUChannelMappingForTracks>[0]> = [];

async function getGPUChannelMapping(): Promise<RegisterGPUChannelMappingForTracks | null> {
  if (registerGPUChannelMappingForTracksFn) {
    return registerGPUChannelMappingForTracksFn;
  }

  if (registerGPUChannelMappingForTracksLoadPromise) {
    return registerGPUChannelMappingForTracksLoadPromise;
  }

  registerGPUChannelMappingForTracksLoadPromise = import('@g-motion/webgpu')
    .then((mod) => {
      registerGPUChannelMappingForTracksFn = mod.registerGPUChannelMappingForTracks;
      return registerGPUChannelMappingForTracksFn;
    })
    .catch(() => null)
    .finally(() => {
      registerGPUChannelMappingForTracksLoadPromise = null;
      const fn = registerGPUChannelMappingForTracksFn;
      if (!fn || pendingRegistrations.length === 0) return;

      const queued = pendingRegistrations.splice(0, pendingRegistrations.length);
      for (const params of queued) {
        fn(params);
      }
    });

  return registerGPUChannelMappingForTracksLoadPromise;
}

function registerMapping(params: Parameters<RegisterGPUChannelMappingForTracks>[0]): void {
  const fn = registerGPUChannelMappingForTracksFn;
  if (fn) {
    fn(params);
    return;
  }

  pendingRegistrations.push(params);
  void getGPUChannelMapping();
}

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
      registerMapping({
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

    registerMapping({
      batchId: archetypeId,
      mode: 'visual',
      trackKeys: tracks.keys(),
      canUseGPU: (property) => visualTarget.canUseGPU(property),
    });
  }
}
