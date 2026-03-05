import type {
  InertiaComponentData as ProtocolInertiaComponentData,
  InertiaParams,
} from '@g-motion/protocol';

/**
 * Inertia animation options.
 */
export interface InertiaOptions extends InertiaParams {
  velocitySource?: (track: string, ctx: { target: unknown }) => number;
}

/**
 * Inertia component data.
 */
export type InertiaComponentData = ProtocolInertiaComponentData;
