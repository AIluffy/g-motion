import type { SystemContext } from '../plugin';
import { SystemDef } from '../plugin';
import { getGPUChannelMappingRegistry } from '../webgpu/channel-mapping';

/**
 * Threshold Monitor System
 *
 * Monitors the count of active animation entities and determines
 * whether GPU batch processing should be enabled based on
 * the configured webgpuThreshold.
 *
 * This system runs at order 1 (early) to make threshold decisions
 * available to batch systems that run later.
 */
export const ThresholdMonitorSystem: SystemDef = {
  name: 'ThresholdMonitorSystem',
  order: 1, // Run early, before batch/GPU systems

  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    const config = ctx?.services.config as any;
    const metrics = ctx?.services.metrics as any;

    if (!world || !config) {
      return;
    }
    const threshold = config.webgpuThreshold ?? 1000;

    const activeCount = world.getActiveMotionEntityCount();

    let complexity = activeCount;
    const sampleEvery = 30;
    (ThresholdMonitorSystem as any).__counter ??= 0;
    (ThresholdMonitorSystem as any).__counter++;
    const doSample = (ThresholdMonitorSystem as any).__counter % sampleEvery === 0;
    if (doSample) {
      let total = 0;
      const registry = getGPUChannelMappingRegistry();
      for (const archetype of world.getArchetypes()) {
        const table = registry.getChannels((archetype as any).id);
        const stride = table?.stride ?? 1;
        const state = (archetype as any).getBuffer?.('MotionState');
        if (!state) continue;
        let act = 0;
        const typed = (archetype as any).getTypedBuffer?.('MotionState', 'status');
        for (let i = 0; i < (archetype as any).entityCount; i++) {
          const s = typed ? typed[i] : (state[i]?.status ?? 0);
          if (s === 1 || s === 2) act++;
        }
        total += act * stride;
      }
      complexity = total > 0 ? total : activeCount;
    }

    // Determine GPU eligibility based on config.gpuCompute mode
    let enabled: boolean;
    if (config.gpuCompute === 'never') {
      // GPU disabled by configuration
      enabled = false;
    } else if (config.gpuCompute === 'always') {
      // GPU enabled by configuration
      enabled = true;
    } else {
      enabled = activeCount >= threshold || complexity >= threshold;
    }

    // Update GPU metrics provider with enabled status
    ctx.services.metrics.updateStatus({
      activeEntityCount: activeCount,
      threshold,
      enabled,
      cpuFallbackActive: metrics?.getStatus?.()?.cpuFallbackActive ?? undefined,
    });
  },
};
