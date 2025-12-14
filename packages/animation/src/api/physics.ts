import { TimelineData, SpringOptions, InertiaOptions } from '@g-motion/core';

export function analyzeSpringTracks(tracks: TimelineData) {
  let hasSpring = false;
  let springConfig: SpringOptions | undefined;
  const springVelocities = new Map<string, number>();

  for (const [trackKey, track] of tracks.entries()) {
    if (!Array.isArray(track) || track.length === 0) continue;

    for (const kf of track) {
      if (kf.spring) {
        if (!hasSpring) {
          hasSpring = true;
          springConfig = kf.spring;
        }
        if (typeof kf.spring.initialVelocity === 'number') {
          springVelocities.set(trackKey, kf.spring.initialVelocity);
        }
      }
    }
  }

  return { hasSpring, springConfig, springVelocities };
}

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

export function analyzeInertiaTracks(tracks: TimelineData, target: any) {
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

export function buildInertiaComponent(
  config: InertiaOptions,
  velocities: Map<string, number>,
): any {
  const normalizeTimeConstant = (cfg: InertiaOptions) => {
    if (typeof cfg.deceleration === 'number' && cfg.deceleration > 0) {
      return 1000 / cfg.deceleration;
    }
    if (typeof cfg.timeConstant === 'number') return cfg.timeConstant;
    if (cfg.duration !== undefined) {
      if (typeof cfg.duration === 'number') return cfg.duration * 1000;
      const avg = (cfg.duration.min + cfg.duration.max) / 2;
      return avg * 1000;
    }
    if (typeof cfg.resistance === 'number') {
      const r = Math.max(1, cfg.resistance);
      return 1000 / r;
    }
    return 350;
  };

  const snap = config.snap ?? (config as any).snapTo ?? config.end;
  const bounds = config.bounds ?? { min: config.min, max: config.max };
  const clamp = config.clamp ?? false;
  const bounceConfig = config.bounce;
  const bounceDisabled = bounceConfig === false;

  return {
    power: config.power ?? 0.8,
    timeConstant: normalizeTimeConstant(config),
    min: bounds.min,
    max: bounds.max,
    bounds,
    clamp: clamp ? 1 : 0,
    snap,
    end: config.end,
    modifyTarget: config.modifyTarget,
    bounceStiffness: bounceDisabled
      ? 0
      : (bounceConfig?.stiffness ?? config.bounceStiffness ?? 500),
    bounceDamping: bounceDisabled ? 0 : (bounceConfig?.damping ?? config.bounceDamping ?? 10),
    bounceMass: bounceDisabled ? 1.0 : (bounceConfig?.mass ?? config.bounceMass ?? 1.0),
    bounce: bounceConfig,
    handoff: config.handoff,
    restSpeed: config.restSpeed ?? 0.5,
    restDelta: config.restDelta ?? 0.5,
    velocities,
    bounceVelocities: new Map<string, number>(),
    inBounce: new Map<string, boolean>(),
  };
}
