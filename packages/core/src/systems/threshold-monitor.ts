import { SystemDef } from '../plugin';
import { WorldProvider } from '../worldProvider';
import { MotionStatus } from '../components/state';
import { getGPUMetricsProvider } from '../webgpu/metrics-provider';

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

  update() {
    const world = WorldProvider.useWorld();
    const config = world.config;
    const threshold = config.webgpuThreshold ?? 1000;

    // Count active running/paused entities across all archetypes
    let activeCount = 0;

    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      if (!stateBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as { status: MotionStatus };
        if (state.status === MotionStatus.Running || state.status === MotionStatus.Paused) {
          activeCount++;
        }
      }
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
      // Auto mode: enabled if activeCount >= threshold
      enabled = activeCount >= threshold;
    }

    // Update GPU metrics provider with enabled status
    const provider = getGPUMetricsProvider();
    provider.updateStatus({
      activeEntityCount: activeCount,
      threshold,
      enabled,
    });
  },
};
