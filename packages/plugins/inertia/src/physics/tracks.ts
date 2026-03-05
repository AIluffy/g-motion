import type { TimelineData, InertiaOptions } from '@g-motion/shared/types';

/**
 * Resolves inertia velocity from options.
 */
function resolveInertiaVelocity(
  inertia: InertiaOptions,
  trackKey: string,
  target: any,
): number | undefined {
  if (typeof inertia.velocity === 'function') {
    return inertia.velocity();
  }
  if (inertia.velocity === 'auto') {
    const source = inertia.velocitySource;
    if (typeof source === 'function') {
      return source(trackKey, { target });
    }
  }
  return inertia.velocity as number | undefined;
}

/**
 * Analyzes timeline tracks for inertia configuration.
 * Returns inertia config if any track has inertia physics.
 */
export function analyzeInertiaTracks(
  tracks: TimelineData,
  target: any,
): {
  hasInertia: boolean;
  inertiaConfig: InertiaOptions | undefined;
  inertiaVelocities: Map<string, number>;
} {
  let hasInertia = false;
  let inertiaConfig: InertiaOptions | undefined;
  const inertiaVelocities = new Map<string, number>();

  for (const [trackKey, track] of tracks.entries()) {
    if (!Array.isArray(track) || track.length === 0) continue;

    for (const kf of track) {
      if (kf.inertia) {
        if (!hasInertia) {
          hasInertia = true;
          inertiaConfig = { ...kf.inertia };
        } else if (inertiaConfig) {
          for (const [key, value] of Object.entries(kf.inertia)) {
            if ((inertiaConfig as any)[key] === undefined) {
              (inertiaConfig as any)[key] = value;
            }
          }
        }

        const velocityValue = resolveInertiaVelocity(kf.inertia, trackKey, target);
        if (typeof velocityValue === 'number' && Number.isFinite(velocityValue)) {
          inertiaVelocities.set(trackKey, velocityValue);
        }
      }
    }
  }

  return { hasInertia, inertiaConfig, inertiaVelocities };
}

/**
 * Build Inertia component data from configuration.
 */
export function buildInertiaComponent(
  config: InertiaOptions,
  velocities: Map<string, number>,
): Record<string, unknown> {
  const normalizeTimeConstant = (cfg: InertiaOptions): number => {
    if (typeof cfg.deceleration === 'number' && cfg.deceleration > 0) {
      return 1000 / cfg.deceleration;
    }

    if (typeof cfg.duration === 'number' && cfg.duration > 0) {
      return cfg.duration * 1000;
    }
    if (cfg.duration && typeof cfg.duration === 'object') {
      const min = cfg.duration.min;
      const max = cfg.duration.max;
      if (typeof min === 'number' && typeof max === 'number') {
        return ((min + max) / 2) * 1000;
      }
      if (typeof min === 'number') return min * 1000;
      if (typeof max === 'number') return max * 1000;
    }

    if (typeof cfg.resistance === 'number') {
      const r = Math.max(1, cfg.resistance);
      return 1000 / r;
    }

    return 350;
  };

  const bounds = config.bounds ?? { min: config.min, max: config.max };
  const clamp = config.clamp === true;

  return {
    timeConstant: normalizeTimeConstant(config),
    min: bounds.min,
    max: bounds.max,
    bounds,
    clamp: clamp ? 1 : 0,
    bounce: config.bounce,
    restSpeed: config.restSpeed ?? 0.5,
    restDelta: config.restDelta ?? 0.5,
    velocities,
  };
}
