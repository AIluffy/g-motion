import type { MotionValue } from '../motion-value';
import type {
  AnimationTarget,
  ChannelInput,
  Easing,
  FromToInput,
  Keyframe,
  KeyframeInput,
  MotionProps,
  TimelineConfig,
  TimelineLayerConfig,
} from '../facade/types';

export const DEFAULT_DURATION = 300;

const TIMELINE_RESERVED_KEYS = new Set([
  'target',
  'duration',
  'layers',
  'markers',
  'workArea',
  'autoplay',
]);
const LAYER_RESERVED_KEYS = new Set([
  'name',
  'target',
  'duration',
  'startTime',
  'visible',
  'locked',
]);
const TRANSFORM_DEFAULTS: Record<string, number> = {
  x: 0,
  y: 0,
  z: 0,
  rotate: 0,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  perspective: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  opacity: 1,
};

export interface KeyframeChannel {
  kind: 'keyframes';
  initialValue: number;
  duration: number;
  keyframes: Keyframe[];
}

export interface MotionValueChannel {
  kind: 'motion-value';
  source: MotionValue;
  initialValue: number;
  duration: number;
}

export type ChannelSpec = KeyframeChannel | MotionValueChannel;

export interface TrackModel {
  property: string;
  channel: ChannelSpec;
}

export interface LayerModel {
  name: string;
  target: AnimationTarget;
  startTime: number;
  visible: boolean;
  locked: boolean;
  explicitDuration?: number;
  duration: number;
  trackOrder: string[];
  tracks: Record<string, TrackModel>;
}

export interface TimelineAuthoringModel {
  explicitDuration?: number;
  markers: Record<string, number>;
  workArea?: [number, number];
  selectedLayer: string | null;
  layers: LayerModel[];
}

export function isMotionValue(input: ChannelInput): input is MotionValue {
  return typeof input === 'object' && input !== null && 'get' in input && 'set' in input;
}

export function isFromToInput(input: ChannelInput): input is FromToInput {
  return typeof input === 'object' && input !== null && !Array.isArray(input) && 'from' in input;
}

export function isChannelInputValue(input: unknown): input is ChannelInput {
  if (typeof input === 'number') {
    return true;
  }
  if (Array.isArray(input)) {
    return (
      input.length > 0 &&
      input.every(
        (entry) => typeof entry === 'number' || (typeof entry === 'object' && entry !== null),
      )
    );
  }
  if (typeof input === 'object' && input !== null) {
    if ('get' in input && 'set' in input) {
      return true;
    }
    if ('from' in input && 'to' in input && 'duration' in input) {
      return true;
    }
  }
  return false;
}

function isDomElement(target: AnimationTarget): target is Element {
  return typeof Element !== 'undefined' && target instanceof Element;
}

function isDomTarget(target: AnimationTarget): boolean {
  return typeof target === 'string' || isDomElement(target);
}

function getDefaultValue(property: string): number {
  return TRANSFORM_DEFAULTS[property] ?? 0;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function getElement(target: AnimationTarget): Element | null {
  if (typeof target === 'string') {
    return typeof document === 'undefined' ? null : document.querySelector(target);
  }

  return isDomElement(target) ? target : null;
}

function parseTransformValue(transform: string, property: string): number | undefined {
  const matchers: Record<string, string[]> = {
    x: ['translateX', 'translate3d'],
    y: ['translateY', 'translate3d'],
    z: ['translateZ', 'translate3d'],
    rotate: ['rotate'],
    rotateX: ['rotateX'],
    rotateY: ['rotateY'],
    rotateZ: ['rotateZ'],
    perspective: ['perspective'],
    scale: ['scale'],
    scaleX: ['scaleX'],
    scaleY: ['scaleY'],
    scaleZ: ['scaleZ'],
  };

  const names = matchers[property];
  if (!names) {
    return undefined;
  }

  for (const name of names) {
    const matched = transform.match(new RegExp(`${name}\\(([^)]+)\\)`));
    if (!matched) {
      continue;
    }
    const raw = matched[1] ?? '';
    const pieces = raw.split(',').map((piece) => parseFloat(piece.trim()));
    if (name === 'translate3d') {
      const axis = property === 'x' ? 0 : property === 'y' ? 1 : 2;
      const candidate = pieces[axis];
      if (Number.isFinite(candidate)) {
        return candidate;
      }
      continue;
    }
    const candidate = pieces[0];
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function readDomValue(target: AnimationTarget, property: string): number {
  const element = getElement(target);
  if (!element) {
    return getDefaultValue(property);
  }

  const inlineTransform = (element as HTMLElement).style?.transform ?? '';
  const transformValue = parseTransformValue(inlineTransform, property);
  if (transformValue !== undefined) {
    return transformValue;
  }

  const computed =
    typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(element as Element)
      : undefined;
  const computedTransform = computed?.transform ?? '';
  const computedTransformValue = parseTransformValue(computedTransform, property);
  if (computedTransformValue !== undefined) {
    return computedTransformValue;
  }

  const cssValue =
    computed?.getPropertyValue(toKebabCase(property)) ??
    (element as HTMLElement).style?.[property as keyof CSSStyleDeclaration];
  const numeric = parseFloat(String(cssValue ?? ''));
  return Number.isFinite(numeric) ? numeric : getDefaultValue(property);
}

function readObjectValue(target: AnimationTarget, property: string): number {
  if (typeof target !== 'object' || target === null || isDomElement(target)) {
    return getDefaultValue(property);
  }

  const accessorTarget = target as {
    get?: (key: string) => unknown;
    [key: string]: unknown;
  };

  if (typeof accessorTarget.get === 'function') {
    const candidate = Number(accessorTarget.get(property));
    return Number.isFinite(candidate) ? candidate : getDefaultValue(property);
  }

  const candidate = Number(accessorTarget[property]);
  return Number.isFinite(candidate) ? candidate : getDefaultValue(property);
}

export function readCurrentValue(target: AnimationTarget, property: string): number {
  return isDomTarget(target) ? readDomValue(target, property) : readObjectValue(target, property);
}

function createKeyframesFromNumbers(values: number[], duration: number): Keyframe[] {
  if (values.length === 1) {
    return [
      { time: 0, value: values[0]! },
      { time: duration, value: values[0]! },
    ];
  }

  return values.map((entry, index) => ({
    time: (duration * index) / (values.length - 1),
    value: entry,
  }));
}

function normalizeKeyframeEntry(property: string, entry: KeyframeInput): Keyframe {
  const time = 'time' in entry ? entry.time : entry.t;
  const value = 'value' in entry ? entry.value : entry.v;
  const easing = 'easing' in entry ? entry.easing : 'e' in entry ? entry.e : undefined;
  const hold = entry.hold === true ? true : undefined;

  if (!Number.isFinite(time) || !Number.isFinite(value)) {
    throw new Error(
      `Invalid keyframe for "${property}": expected { time, value } or { t, v } with finite numbers`,
    );
  }

  return {
    time,
    value,
    ...(easing !== undefined ? { easing } : {}),
    ...(hold ? { hold: true } : {}),
  };
}

export function normalizeEditableCurve(
  property: string,
  keyframes: KeyframeInput[],
): KeyframeChannel {
  if (keyframes.length === 0) {
    throw new Error(`Track "${property}" requires at least one keyframe`);
  }

  const normalized = keyframes
    .map((entry) => normalizeKeyframeEntry(property, entry))
    .sort((left, right) => left.time - right.time);

  return {
    kind: 'keyframes',
    initialValue: normalized[0]!.value,
    duration: normalized[normalized.length - 1]!.time,
    keyframes: normalized,
  };
}

function normalizeKeyframeChannel(
  property: string,
  input: Exclude<ChannelInput, MotionValue>,
  target: AnimationTarget,
  defaultDuration: number,
  defaultEasing?: Easing,
): KeyframeChannel {
  if (typeof input === 'number') {
    const initialValue = readCurrentValue(target, property);
    return {
      kind: 'keyframes',
      initialValue,
      duration: defaultDuration,
      keyframes: [
        {
          time: 0,
          value: initialValue,
          ...(defaultEasing !== undefined ? { easing: defaultEasing } : {}),
        },
        {
          time: defaultDuration,
          value: input,
        },
      ],
    };
  }

  if (Array.isArray(input) && typeof input[0] === 'number') {
    const keyframes = createKeyframesFromNumbers(input as number[], defaultDuration);
    return {
      kind: 'keyframes',
      initialValue: keyframes[0]?.value ?? getDefaultValue(property),
      duration: keyframes[keyframes.length - 1]?.time ?? 0,
      keyframes,
    };
  }

  if (Array.isArray(input) && input.length > 0) {
    return normalizeEditableCurve(property, input as KeyframeInput[]);
  }

  if (isFromToInput(input)) {
    return {
      kind: 'keyframes',
      initialValue: input.from,
      duration: input.duration,
      keyframes: [
        {
          time: 0,
          value: input.from,
          ...(input.easing !== undefined ? { easing: input.easing } : {}),
        },
        {
          time: input.duration,
          value: input.to,
        },
      ],
    };
  }

  return {
    kind: 'keyframes',
    initialValue: getDefaultValue(property),
    duration: 0,
    keyframes: [{ time: 0, value: getDefaultValue(property) }],
  };
}

export function normalizeChannel(
  property: string,
  input: ChannelInput,
  target: AnimationTarget,
  defaultDuration: number,
  defaultEasing?: Easing,
): ChannelSpec {
  if (isMotionValue(input)) {
    return {
      kind: 'motion-value',
      source: input,
      initialValue: input.get(),
      duration: 0,
    };
  }

  return normalizeKeyframeChannel(property, input, target, defaultDuration, defaultEasing);
}

export function toLayerProps(input: Record<string, unknown>, reserved: Set<string>): MotionProps {
  const props: MotionProps = {};

  for (const [key, value] of Object.entries(input)) {
    if (reserved.has(key) || !isChannelInputValue(value)) {
      continue;
    }
    props[key] = value;
  }

  return props;
}

function createLayerModel(
  config:
    | TimelineLayerConfig
    | (Record<string, unknown> & { target: AnimationTarget; name: string }),
  props: MotionProps,
  defaultDuration: number,
): LayerModel {
  const tracks: Record<string, TrackModel> = {};
  const trackOrder: string[] = [];
  let duration = typeof config.duration === 'number' ? config.duration : 0;

  for (const [property, input] of Object.entries(props)) {
    const channel = normalizeChannel(property, input, config.target, defaultDuration);
    tracks[property] = {
      property,
      channel,
    };
    trackOrder.push(property);
    duration = Math.max(duration, channel.duration);
  }

  return {
    name: config.name,
    target: config.target,
    startTime: Math.max(0, Number(config.startTime ?? 0)),
    visible: config.visible !== false,
    locked: config.locked === true,
    explicitDuration: typeof config.duration === 'number' ? config.duration : undefined,
    duration,
    trackOrder,
    tracks,
  };
}

export function calculateLayerDuration(layer: LayerModel): number {
  const trackDuration = layer.trackOrder.reduce((maxDuration, property) => {
    const track = layer.tracks[property];
    return Math.max(maxDuration, track?.channel.duration ?? 0);
  }, 0);

  return Math.max(layer.explicitDuration ?? 0, trackDuration);
}

export function recalculateLayer(layer: LayerModel): void {
  layer.duration = calculateLayerDuration(layer);
}

export function calculateTimelineDuration(model: TimelineAuthoringModel): number {
  const layerDuration = model.layers.reduce((maxDuration, layer) => {
    return Math.max(maxDuration, layer.startTime + layer.duration);
  }, 0);

  return Math.max(model.explicitDuration ?? 0, layerDuration);
}

export function createTimelineAuthoringModel(config: TimelineConfig): TimelineAuthoringModel {
  const defaultDuration =
    typeof config.duration === 'number' && config.duration > 0 ? config.duration : DEFAULT_DURATION;

  const layers =
    config.layers?.map((layer) =>
      createLayerModel(
        layer,
        toLayerProps(layer, LAYER_RESERVED_KEYS),
        layer.duration ?? defaultDuration,
      ),
    ) ??
    (config.target
      ? [
          createLayerModel(
            {
              ...config,
              name: 'default',
              target: config.target,
            },
            toLayerProps(config, TIMELINE_RESERVED_KEYS),
            defaultDuration,
          ),
        ]
      : []);

  return {
    explicitDuration: typeof config.duration === 'number' ? config.duration : undefined,
    markers: { ...(config.markers ?? {}) },
    workArea: config.workArea,
    selectedLayer: null,
    layers,
  };
}
