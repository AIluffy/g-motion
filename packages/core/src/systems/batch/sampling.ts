import { SystemDef } from '../../plugin';
import { WorldProvider } from '../../worldProvider';
import { MotionStatus } from '../../components/state';
import { getGPUMetricsProvider } from '../../webgpu/metrics-provider';
import { getEasingId } from '../easing-registry';
import { getAppContext } from '../../context';
import { BatchEntity, BatchKeyframe } from './types';

/**
 * Batch Sampling System
 *
 * Gathers animation data from entity components and prepares them for batch processing.
 * This system identifies GPU-eligible entities and prepares their data for WebGPU compute pipeline.
 *
 * Supports:
 * 1. Per-archetype segmented batches (new)
 * 2. Legacy single-batch processing (backward compatibility)
 *
 * Responsibilities:
 * 1. Iterate through all archetypes and active entities with animation state
 * 2. Filter entities eligible for GPU processing (numeric values, no custom callbacks)
 * 3. Segment entities by archetype for per-archetype GPU dispatch
 * 4. Prepare entity state data (startTime, currentTime, playbackRate, status)
 * 5. Collect keyframe data for interpolation
 * 6. Mark batches ready for GPU dispatch
 *
 * This system runs before WebGPUComputeSystem (order 5 < 6) to ensure
 * data is prepared and ready for compute dispatch.
 */
export const BatchSamplingSystem: SystemDef = {
  name: 'BatchSamplingSystem',
  order: 5, // Run before WebGPUComputeSystem

  update() {
    const world = WorldProvider.useWorld();
    const now = performance.now();
    const config = world.config;

    // Determine GPU eligibility based on config.gpuCompute mode
    let gpuEnabled: boolean;
    if (config.gpuCompute === 'never') {
      // Skip GPU processing if explicitly disabled
      return;
    } else if (config.gpuCompute === 'always') {
      // Always use GPU if available
      gpuEnabled = true;
    } else {
      // Auto mode: check threshold
      gpuEnabled = getGPUMetricsProvider().getStatus().enabled;
    }

    // Skip batch processing if GPU is disabled
    if (!gpuEnabled) {
      return;
    }

    // Initialize processor
    const context = getAppContext();
    const processor = context.getBatchProcessor({ maxBatchSize: 1024 });

    // Clear previous archetype batches (per-frame refresh)
    processor.clearArchetypeBatches();

    // Per-archetype batch collection
    let totalEntities = 0;
    for (const archetype of world.getArchetypes()) {
      const stateBuffer = archetype.getBuffer('MotionState');
      const timelineBuffer = archetype.getBuffer('Timeline');
      const renderBuffer = archetype.getBuffer('Render');

      if (!stateBuffer || !timelineBuffer || !renderBuffer) {
        continue; // Skip archetypes missing animation components
      }

      // Collect entities from this archetype that are:
      // - Running or Paused
      // - NOT using callback renderers (GPU only for numeric/DOM)
      const archEntities: BatchEntity[] = [];
      const archKeyframes: BatchKeyframe[] = [];

      for (let i = 0; i < archetype.entityCount; i++) {
        const state = stateBuffer[i] as {
          status: MotionStatus;
          startTime: number;
          playbackRate: number;
        };
        const timeline = timelineBuffer[i] as {
          tracks?: Map<string, unknown>;
        };
        const render = renderBuffer[i] as {
          rendererId: string;
        };

        // Skip callback renderers (custom onUpdate)
        if (render.rendererId === 'callback') {
          continue;
        }

        // Only include running/paused animations
        if (state.status !== MotionStatus.Running && state.status !== MotionStatus.Paused) {
          continue;
        }

        const entityId = archetype.getEntityId(i);
        archEntities.push({
          id: entityId,
          startTime: state.startTime,
          currentTime: now,
          playbackRate: state.playbackRate,
          status: state.status,
        });

        // Collect keyframes for this entity
        if (timeline.tracks && timeline.tracks.size > 0) {
          for (const [, track] of timeline.tracks) {
            if (Array.isArray(track)) {
              for (const kf of track) {
                // Map easing functions to IDs using getEasingId()
                // If gpuEasing=false, always use easingId=0 (linear)
                // If gpuEasing=true, use getEasingId(kf.easing)
                const easingId = config.gpuEasing === false ? 0 : getEasingId(kf.easing);

                archKeyframes.push({
                  entityId,
                  startTime: kf.startTime,
                  duration: kf.time - kf.startTime,
                  startValue: kf.startValue,
                  endValue: kf.endValue,
                  easingId,
                });
              }
            }
          }
        }
      }

      // Create per-archetype batch if entities exist
      if (archEntities.length > 0) {
        // Pack entity states as flat Float32Array
        const statesData = new Float32Array(archEntities.length * 4);
        archEntities.forEach((entity, idx) => {
          const offset = idx * 4;
          statesData[offset] = entity.startTime;
          statesData[offset + 1] = entity.currentTime;
          statesData[offset + 2] = entity.playbackRate;
          statesData[offset + 3] = entity.status;
        });

        // Pack keyframes as flat Float32Array
        const keyframesData = new Float32Array(archKeyframes.length * 5);
        archKeyframes.forEach((keyframe, idx) => {
          const offset = idx * 5;
          keyframesData[offset] = keyframe.startTime;
          keyframesData[offset + 1] = keyframe.duration;
          keyframesData[offset + 2] = keyframe.startValue;
          keyframesData[offset + 3] = keyframe.endValue;
          keyframesData[offset + 4] = keyframe.easingId;
        });

        // Extract entity IDs efficiently
        const entityIds: number[] = [];
        for (let i = 0; i < archEntities.length; i++) {
          entityIds.push(archEntities[i].id);
        }

        // Add per-archetype batch with adaptive workgroup hint
        const batch = processor.addArchetypeBatch(
          archetype.id,
          entityIds,
          statesData,
          keyframesData,
        );

        totalEntities += batch.entityCount;
      }
    }

    // Update context for WebGPUComputeSystem to access per-archetype batches
    if (totalEntities > 0) {
      context.updateBatchContext({
        lastBatchId: `batch-${Math.floor(now / 1000)}`,
        entityCount: totalEntities,
        archetypeBatchesReady: true,
      });
    }
  },
};
