import { isPluginRegistered } from '@g-motion/core';
import type { InertiaParams, TimelineData, SpringParams } from '@g-motion/core';

type InertiaRuntimeParams = InertiaParams & {
  velocitySource?: (track: string, ctx: { target: unknown }) => number;
};

type InertiaAnalysis = {
  hasInertia: boolean;
  inertiaConfig: InertiaRuntimeParams | undefined;
  inertiaVelocities: Map<string, number>;
};

type SpringAnalysis = {
  hasSpring: boolean;
  springConfig: SpringParams | undefined;
  springVelocities: Map<string, number>;
};

function resolveInertiaVelocity(
  inertia: InertiaRuntimeParams,
  trackKey: string,
  target: unknown,
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

export function analyzeSpringTracks(tracks: TimelineData): SpringAnalysis {
  let hasSpring = false;
  let springConfig: SpringParams | undefined;
  const springVelocities = new Map<string, number>();

  for (const [trackKey, track] of tracks.entries()) {
    if (!Array.isArray(track) || track.length === 0) continue;

    for (const kf of track) {
      if (!kf.spring) continue;
      if (!hasSpring) {
        hasSpring = true;
        springConfig = kf.spring;
      }
      if (typeof kf.spring.initialVelocity === 'number') {
        springVelocities.set(trackKey, kf.spring.initialVelocity);
      }
    }
  }

  return { hasSpring, springConfig, springVelocities };
}

export function analyzeInertiaTracks(tracks: TimelineData, target: unknown): InertiaAnalysis {
  let hasInertia = false;
  let inertiaConfig: InertiaRuntimeParams | undefined;
  const inertiaVelocities = new Map<string, number>();

  for (const [trackKey, track] of tracks.entries()) {
    if (!Array.isArray(track) || track.length === 0) continue;

    for (const kf of track) {
      if (!kf.inertia) continue;
      if (!hasInertia) {
        hasInertia = true;
        inertiaConfig = { ...kf.inertia };
      } else if (inertiaConfig) {
        for (const [key, value] of Object.entries(kf.inertia)) {
          if ((inertiaConfig as Record<string, unknown>)[key] === undefined) {
            (inertiaConfig as Record<string, unknown>)[key] = value;
          }
        }
      }

      const velocityValue = resolveInertiaVelocity(kf.inertia, trackKey, target);
      if (typeof velocityValue === 'number' && Number.isFinite(velocityValue)) {
        inertiaVelocities.set(trackKey, velocityValue);
      }
    }
  }

  return { hasInertia, inertiaConfig, inertiaVelocities };
}

export function buildInertiaComponent(
  config: InertiaParams,
  velocities: Map<string, number>,
): Record<string, unknown> {
  const normalizeTimeConstant = (cfg: InertiaParams): number => {
    if (typeof cfg.deceleration === 'number' && cfg.deceleration > 0) {
      return 1000 / cfg.deceleration;
    }
    if (typeof cfg.duration === 'number' && cfg.duration > 0) {
      return cfg.duration * 1000;
    }
    if (cfg.duration && typeof cfg.duration === 'object') {
      const min = cfg.duration.min;
      const max = cfg.duration.max;
      if (typeof min === 'number' && typeof max === 'number') return ((min + max) / 2) * 1000;
      if (typeof min === 'number') return min * 1000;
      if (typeof max === 'number') return max * 1000;
    }
    if (typeof cfg.resistance === 'number') {
      return 1000 / Math.max(1, cfg.resistance);
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

export function assertPhysicsPluginInstalled(
  plugin: 'spring' | 'inertia',
  feature: 'spring' | 'inertia',
): void {
  if (isPluginRegistered(plugin)) return;
  throw new Error(
    `[Motion] ${feature} physics is configured but @g-motion/plugin-${plugin} is not installed/registered. ` +
      `Install and import '@g-motion/plugin-${plugin}' before creating this animation.`,
  );
}
