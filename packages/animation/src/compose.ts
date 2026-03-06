import type { ComposeConfig, Composition, MotionProps } from './facade/types';
import {
  DEFAULT_DURATION,
  calculateLayerDuration,
  normalizeChannel,
  toLayerProps,
} from './controllers/authoring';

function freezeProps(props: MotionProps): Readonly<MotionProps> {
  return Object.freeze({ ...props });
}

export function compose(config: ComposeConfig): Composition {
  const defaultDuration =
    typeof config.duration === 'number' && config.duration > 0 ? config.duration : DEFAULT_DURATION;
  const props = toLayerProps(config, new Set(['target', 'duration']));
  const target = config.target;
  const propEntries = Object.entries(props);

  const duration =
    propEntries.length === 0
      ? defaultDuration
      : calculateLayerDuration({
          name: 'composition',
          target: target ?? {},
          startTime: 0,
          visible: true,
          locked: false,
          duration: 0,
          trackOrder: propEntries.map(([property]) => property),
          tracks: Object.fromEntries(
            propEntries.map(([property, input]) => [
              property,
              {
                property,
                channel: normalizeChannel(property, input, target ?? {}, defaultDuration),
              },
            ]),
          ),
        });

  return Object.freeze({
    kind: 'composition' as const,
    duration,
    ...(target !== undefined ? { target } : {}),
    props: freezeProps(props),
  });
}
