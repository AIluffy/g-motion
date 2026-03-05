import type { TimelineData } from '@g-motion/shared';
import type { SpringOptions } from '../types';

/**
 * Analyzes timeline tracks for spring configuration.
 * Returns spring config if any track has spring physics.
 */
export function analyzeSpringTracks(tracks: TimelineData): {
  hasSpring: boolean;
  springConfig: SpringOptions | undefined;
  springVelocities: Map<string, number>;
} {
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

/**
 * Build Spring component data from configuration.
 */
export function buildSpringComponent(
  config: SpringOptions,
  velocities: Map<string, number>,
): Record<string, unknown> {
  return {
    stiffness: config.stiffness ?? 100,
    damping: config.damping ?? 10,
    mass: config.mass ?? 1,
    restSpeed: config.restSpeed ?? 10,
    restDelta: config.restDelta ?? 0.01,
    velocities,
  };
}
