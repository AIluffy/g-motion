import { MotionStatus } from '@g-motion/core';
import { clamp, clamp01, getNowMs, lerp } from '@g-motion/shared';

import type { MotionValue } from '../motion-value';
import { value } from '../motion-value';
import type {
  AnimationTarget,
  ChannelInput,
  Easing,
  FromToInput,
  KeyframeInput,
  MotionController,
  MotionOptions,
  MotionProps,
  TimelineConfig,
  TimelineController,
} from '../facade/types';
import { ensureAnimationRuntime, flushAnimationRuntimeFrame } from '../runtime/bootstrap';

const DEFAULT_DURATION = 300;
const DEFAULT_WORK_AREA: [number, number] = [0, 0];
const TIMELINE_RESERVED_KEYS = new Set([
  'target',
  'duration',
  'layers',
  'markers',
  'workArea',
  'autoplay',
]);
const LAYER_RESERVED_KEYS = new Set(['name', 'target', 'duration', 'startTime']);
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

type PlaybackStatus = 'idle' | 'running' | 'paused' | 'finished';
type EasingFunction = (value: number) => number;

interface NormalizedKeyframe {
  time: number;
  value: number;
  easing?: EasingFunction;
  hold?: boolean;
}

interface KeyframeChannel {
  kind: 'keyframes';
  initialValue: number;
  duration: number;
  keyframes: NormalizedKeyframe[];
}

interface MotionValueChannel {
  kind: 'motion-value';
  source: MotionValue;
  initialValue: number;
  duration: number;
}

type ChannelSpec = KeyframeChannel | MotionValueChannel;

interface LayerBindingState {
  entityId: number;
  controller: ControllerState;
  target: AnimationTarget;
  offset: number;
  rendererId: 'dom' | 'object';
  channels: Record<string, ChannelSpec>;
  mirrors: Record<string, MotionValue>;
}

interface ControllerState {
  duration: number;
  currentTime: number;
  direction: 1 | -1;
  status: PlaybackStatus;
  startedAt: number;
  startedFrom: number;
  markers: Record<string, number>;
  workArea: [number, number];
  timeMotionValue: MotionValue;
  progressMotionValue: MotionValue;
  bindings: LayerBindingState[];
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
  completedNotified: boolean;
  lastSyncedAt: number;
  version: number;
}

type MutableRenderComponent = {
  rendererId: string;
  rendererCode?: number;
  target: unknown;
  props?: Record<string, number>;
  version?: number;
  renderedVersion?: number;
};

type MutableMotionState = {
  delay: number;
  startTime: number;
  pausedAt: number;
  currentTime: number;
  playbackRate: number;
  status: number;
  iteration: number;
  tickInterval: number;
  tickPhase: number;
  tickPriority: number;
};

type MutableAnimationBindingComponent = {
  state: LayerBindingState;
};

function writeNumericField(
  binding: LayerBindingState,
  componentName: string,
  fieldName: string,
  value: number,
): void {
  const location = locateBinding(binding);
  if (!location) {
    return;
  }

  const buffer = location.archetype.getBuffer(componentName);
  const typedBuffer = location.archetype.getTypedBuffer(componentName, fieldName);
  const component = buffer?.[location.index] as Record<string, unknown> | undefined;

  if (component) {
    component[fieldName] = value;
  }
  if (typedBuffer) {
    typedBuffer[location.index] = value;
  }
}

function now(): number {
  return getNowMs();
}

function isMotionValue(input: ChannelInput): input is MotionValue {
  return typeof input === 'object' && input !== null && 'get' in input && 'set' in input;
}

function isChannelInputValue(input: unknown): input is ChannelInput {
  if (typeof input === 'number') {
    return true;
  }
  if (Array.isArray(input)) {
    return input.every(
      (entry) =>
        typeof entry === 'number' ||
        (typeof entry === 'object' && entry !== null && 'time' in entry && 'value' in entry),
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

function isFromToInput(input: ChannelInput): input is FromToInput {
  return typeof input === 'object' && input !== null && !Array.isArray(input) && 'from' in input;
}

function isKeyframeArray(input: ChannelInput): input is KeyframeInput[] {
  return Array.isArray(input) && input.length > 0 && typeof input[0] === 'object';
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

function readCurrentValue(target: AnimationTarget, property: string): number {
  return isDomTarget(target) ? readDomValue(target, property) : readObjectValue(target, property);
}

function resolveEasing(easing?: Easing): EasingFunction | undefined {
  if (!easing) {
    return undefined;
  }
  if (typeof easing === 'function') {
    return easing;
  }

  switch (easing) {
    case 'easeIn':
      return (time) => time * time;
    case 'easeOut':
      return (time) => 1 - (1 - time) * (1 - time);
    case 'easeInOut':
      return (time) => (time < 0.5 ? 2 * time * time : 1 - Math.pow(-2 * time + 2, 2) / 2);
    default:
      return (time) => time;
  }
}

function createKeyframesFromNumbers(values: number[], duration: number): NormalizedKeyframe[] {
  if (values.length === 1) {
    return [
      { time: 0, value: values[0]! },
      { time: duration, value: values[0]! },
    ];
  }

  return values.map((entry, index) => ({
    time: values.length === 1 ? duration : (duration * index) / (values.length - 1),
    value: entry,
  }));
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
          easing: resolveEasing(defaultEasing),
        },
        {
          time: defaultDuration,
          value: input,
        },
      ],
    };
  }

  if (Array.isArray(input) && input.length > 0 && typeof input[0] === 'number') {
    const keyframes = createKeyframesFromNumbers(input as number[], defaultDuration);
    return {
      kind: 'keyframes',
      initialValue: keyframes[0]?.value ?? getDefaultValue(property),
      duration: keyframes[keyframes.length - 1]?.time ?? 0,
      keyframes,
    };
  }

  if (isKeyframeArray(input)) {
    const keyframes = input
      .map((entry) => ({
        time: entry.time,
        value: entry.value,
        easing: resolveEasing(entry.easing),
        hold: entry.hold,
      }))
      .sort((left, right) => left.time - right.time);
    return {
      kind: 'keyframes',
      initialValue: keyframes[0]?.value ?? getDefaultValue(property),
      duration: keyframes[keyframes.length - 1]?.time ?? 0,
      keyframes,
    };
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
          easing: resolveEasing(input.easing),
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

function normalizeChannel(
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

function sampleKeyframes(channel: KeyframeChannel, localTime: number): number {
  const { keyframes } = channel;
  if (keyframes.length === 0) {
    return channel.initialValue;
  }
  if (localTime <= keyframes[0]!.time) {
    return keyframes[0]!.value;
  }

  for (let index = 1; index < keyframes.length; index++) {
    const previous = keyframes[index - 1]!;
    const next = keyframes[index]!;
    if (localTime > next.time) {
      continue;
    }
    if (previous.hold || next.time === previous.time) {
      return previous.value;
    }
    const progress = clamp01((localTime - previous.time) / (next.time - previous.time));
    const eased = previous.easing ? previous.easing(progress) : progress;
    return lerp(previous.value, next.value, eased);
  }

  return keyframes[keyframes.length - 1]!.value;
}

function sampleChannel(channel: ChannelSpec, localTime: number): number {
  if (channel.kind === 'motion-value') {
    return channel.source.get();
  }

  return sampleKeyframes(channel, localTime);
}

function shallowEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => Object.is(left[key], right[key]));
}

function locateBinding(binding: LayerBindingState) {
  const { world } = ensureAnimationRuntime();
  const archetype = world.getEntityArchetype(binding.entityId);
  if (!archetype) {
    return null;
  }
  const index = archetype.getInternalEntityIndices().get(binding.entityId);
  if (index === undefined) {
    return null;
  }
  return { archetype, index };
}

function setBindingStatus(binding: LayerBindingState, status: number): void {
  const { world } = ensureAnimationRuntime();
  const location = locateBinding(binding);
  if (!location) {
    return;
  }
  world.setMotionStatusAt(location.archetype, location.index, status);
}

function updateBindingState(binding: LayerBindingState, localTime: number): void {
  const location = locateBinding(binding);
  if (!location) {
    return;
  }

  const motionStateBuffer = location.archetype.getBuffer('MotionState');
  if (!motionStateBuffer) {
    return;
  }
  const motionState = motionStateBuffer[location.index] as MutableMotionState | undefined;
  if (!motionState) {
    return;
  }

  motionState.currentTime = localTime;
  motionState.playbackRate = binding.controller.direction;
  motionState.delay = binding.offset;
  writeNumericField(binding, 'MotionState', 'currentTime', localTime);
  writeNumericField(binding, 'MotionState', 'playbackRate', binding.controller.direction);
  writeNumericField(binding, 'MotionState', 'delay', binding.offset);
}

function applyBindingFrame(binding: LayerBindingState): void {
  const location = locateBinding(binding);
  if (!location) {
    return;
  }

  const renderBuffer = location.archetype.getBuffer('Render');
  if (!renderBuffer) {
    return;
  }

  const render = renderBuffer[location.index] as MutableRenderComponent | undefined;
  if (!render) {
    return;
  }

  const localTime = binding.controller.currentTime - binding.offset;
  const nextProps: Record<string, number> = {};

  for (const [property, channel] of Object.entries(binding.channels)) {
    const nextValue = sampleChannel(channel, localTime);
    nextProps[property] = nextValue;
    const mirror = binding.mirrors[property];
    if (mirror) {
      mirror.set(nextValue);
    }
  }

  updateBindingState(binding, localTime);

  const currentProps = render.props ?? {};
  if (shallowEqual(currentProps, nextProps)) {
    return;
  }

  render.props = nextProps;
  render.version = (render.version ?? 0) + 1;
  writeNumericField(binding, 'Render', 'version', render.version);
}

function syncControllerClock(
  controller: ControllerState,
  timestamp: number,
  emitLifecycle: boolean,
): void {
  if (controller.lastSyncedAt === timestamp) {
    return;
  }

  if (controller.status === 'running') {
    const delta = timestamp - controller.startedAt;
    const rawTime = controller.startedFrom + delta * controller.direction;
    const [start, end] = controller.workArea;

    if (controller.direction > 0 && rawTime >= end) {
      controller.currentTime = end;
      controller.status = 'finished';
    } else if (controller.direction < 0 && rawTime <= start) {
      controller.currentTime = start;
      controller.status = 'finished';
    } else {
      controller.currentTime = clamp(rawTime, 0, controller.duration);
    }
  }

  controller.timeMotionValue.set(controller.currentTime);
  const progress =
    controller.duration > 0 ? clamp01(controller.currentTime / controller.duration) : 0;
  controller.progressMotionValue.set(progress);

  if (emitLifecycle) {
    controller.onUpdate?.(progress);
  }

  if (controller.status === 'finished') {
    for (const binding of controller.bindings) {
      setBindingStatus(binding, MotionStatus.Finished);
    }
    if (emitLifecycle && !controller.completedNotified) {
      controller.completedNotified = true;
      controller.onComplete?.();
    }
  }

  controller.lastSyncedAt = timestamp;
}

function flushController(
  controller: ControllerState,
  timestamp = now(),
  emitLifecycle = false,
): void {
  syncControllerClock(controller, timestamp, emitLifecycle);
  for (const binding of controller.bindings) {
    applyBindingFrame(binding);
  }
  flushAnimationRuntimeFrame(timestamp);
}

function normalizeWorkArea(
  workArea: [number, number] | undefined,
  duration: number,
): [number, number] {
  const [inputStart, inputEnd] = workArea ?? DEFAULT_WORK_AREA;
  const start = clamp(inputStart, 0, duration);
  const end = clamp(inputEnd || duration, start, duration);
  if (!workArea) {
    return [0, duration];
  }
  return [start, end];
}

function toLayerProps(input: Record<string, unknown>, reserved: Set<string>): MotionProps {
  const props: MotionProps = {};

  for (const [key, value] of Object.entries(input)) {
    if (reserved.has(key) || !isChannelInputValue(value)) {
      continue;
    }
    props[key] = value;
  }

  return props;
}

function createLayerBinding(
  controller: ControllerState,
  layerConfig: {
    target: AnimationTarget;
    props: MotionProps;
    offset: number;
    duration?: number;
    defaultDuration: number;
    defaultEasing?: Easing;
  },
): LayerBindingState {
  const channels: Record<string, ChannelSpec> = {};
  const mirrors: Record<string, MotionValue> = {};
  let layerDuration = layerConfig.duration ?? 0;

  for (const [property, input] of Object.entries(layerConfig.props)) {
    const channel = normalizeChannel(
      property,
      input,
      layerConfig.target,
      layerConfig.defaultDuration,
      layerConfig.defaultEasing,
    );
    channels[property] = channel;
    layerDuration = Math.max(layerDuration, channel.duration);
    if (!isMotionValue(input)) {
      mirrors[property] = value(channel.initialValue);
    }
  }

  const { world } = ensureAnimationRuntime();
  const initialProps = Object.fromEntries(
    Object.entries(channels).map(([property, channel]) => [property, channel.initialValue]),
  ) as Record<string, number>;

  const binding = {
    entityId: -1,
    controller,
    target: layerConfig.target,
    offset: layerConfig.offset,
    rendererId: isDomTarget(layerConfig.target) ? 'dom' : 'object',
    channels,
    mirrors,
  } satisfies LayerBindingState;

  const entityId = world.createEntity({
    MotionState: {
      delay: layerConfig.offset,
      startTime: 0,
      pausedAt: 0,
      currentTime: 0,
      playbackRate: 1,
      status: MotionStatus.Idle,
      iteration: 0,
      tickInterval: 0,
      tickPhase: 0,
      tickPriority: 0,
    },
    Timeline: {
      duration: layerDuration,
      loop: 0,
      repeat: 0,
      version: 0,
      rovingApplied: 0,
    },
    Render: {
      rendererId: binding.rendererId,
      rendererCode: 0,
      target: layerConfig.target,
      props: initialProps,
      version: 1,
      renderedVersion: -1,
    },
    AnimationBinding: {
      state: binding,
    } satisfies MutableAnimationBindingComponent,
  });

  binding.entityId = entityId;
  return binding;
}

function createControllerState(params: {
  duration: number;
  workArea?: [number, number];
  markers?: Record<string, number>;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}): ControllerState {
  return {
    duration: params.duration,
    currentTime: 0,
    direction: 1,
    status: 'idle',
    startedAt: 0,
    startedFrom: 0,
    markers: params.markers ?? {},
    workArea: normalizeWorkArea(params.workArea, params.duration),
    timeMotionValue: value(0),
    progressMotionValue: value(0),
    bindings: [],
    onUpdate: params.onUpdate,
    onComplete: params.onComplete,
    completedNotified: false,
    lastSyncedAt: Number.NaN,
    version: 0,
  };
}

function startPlayback(controller: ControllerState): void {
  const timestamp = now();
  const [start, end] = controller.workArea;

  if (controller.status === 'finished') {
    controller.currentTime = controller.direction > 0 ? start : end;
  } else if (controller.status !== 'paused') {
    if (
      controller.direction > 0 &&
      (controller.currentTime < start || controller.currentTime > end)
    ) {
      controller.currentTime = start;
    }
    if (
      controller.direction < 0 &&
      (controller.currentTime > end || controller.currentTime < start)
    ) {
      controller.currentTime = end;
    }
  }

  controller.status = 'running';
  controller.startedAt = timestamp;
  controller.startedFrom = controller.currentTime;
  controller.completedNotified = false;
  controller.lastSyncedAt = Number.NaN;

  for (const binding of controller.bindings) {
    setBindingStatus(binding, MotionStatus.Running);
  }

  flushController(controller, timestamp, true);
  ensureAnimationRuntime().engine.scheduler.ensureRunning();
}

function pausePlayback(controller: ControllerState): void {
  if (controller.status !== 'running') {
    return;
  }
  syncControllerClock(controller, now(), false);
  controller.status = 'paused';
  for (const binding of controller.bindings) {
    setBindingStatus(binding, MotionStatus.Idle);
  }
  flushController(controller);
}

function stopPlayback(controller: ControllerState): void {
  controller.status = 'idle';
  controller.direction = 1;
  controller.currentTime = controller.workArea[0];
  controller.startedAt = 0;
  controller.startedFrom = controller.currentTime;
  controller.completedNotified = false;
  controller.lastSyncedAt = Number.NaN;

  for (const binding of controller.bindings) {
    setBindingStatus(binding, MotionStatus.Idle);
  }

  flushController(controller);
}

function reversePlayback(controller: ControllerState): void {
  controller.direction = controller.direction > 0 ? -1 : 1;
  if (controller.status === 'running') {
    syncControllerClock(controller, now(), false);
  }
  startPlayback(controller);
}

function seekPlayback(controller: ControllerState, time: number): void {
  const timestamp = now();
  controller.currentTime = clamp(time, 0, controller.duration);
  controller.startedAt = timestamp;
  controller.startedFrom = controller.currentTime;
  controller.completedNotified = false;
  controller.lastSyncedAt = Number.NaN;
  flushController(controller, timestamp);
}

function seekToMarker(controller: ControllerState, markerName: string): void {
  const marker = controller.markers[markerName];
  if (marker === undefined) {
    throw new Error(`Unknown marker: ${markerName}`);
  }
  seekPlayback(controller, marker);
}

function defineTimelineProperties(
  controller: TimelineController,
  state: ControllerState,
): TimelineController {
  Object.defineProperties(controller, {
    duration: {
      get: () => state.duration,
    },
    currentTime: {
      get: () => state.currentTime,
    },
    progress: {
      get: () => (state.duration > 0 ? clamp01(state.currentTime / state.duration) : 0),
    },
    playhead: {
      get: () => state.currentTime,
      set: (time: number) => seekPlayback(state, time),
    },
    workArea: {
      get: () => [...state.workArea] as [number, number],
      set: (workArea: [number, number]) => {
        state.workArea = normalizeWorkArea(workArea, state.duration);
        state.currentTime = clamp(state.currentTime, state.workArea[0], state.workArea[1]);
        state.lastSyncedAt = Number.NaN;
        flushController(state);
      },
    },
  });
  return controller;
}

function createTimelineControllerObject(state: ControllerState): TimelineController {
  const controller = {
    play: () => startPlayback(state),
    pause: () => pausePlayback(state),
    stop: () => stopPlayback(state),
    seek: (time: number) => seekPlayback(state, time),
    seekToMarker: (name: string) => seekToMarker(state, name),
    reverse: () => reversePlayback(state),
    timeValue: () => state.timeMotionValue,
    progressValue: () => state.progressMotionValue,
    playhead: state.currentTime,
    workArea: [...state.workArea] as [number, number],
    duration: state.duration,
    currentTime: state.currentTime,
    progress: 0,
  } satisfies TimelineController;

  return defineTimelineProperties(controller, state);
}

function createMotionControllerObject(
  state: ControllerState,
  valueLookup: Record<string, MotionValue>,
): MotionController {
  return {
    play: () => startPlayback(state),
    pause: () => pausePlayback(state),
    stop: () => stopPlayback(state),
    seek: (time: number) => seekPlayback(state, time),
    reverse: () => reversePlayback(state),
    value: (key: string) => valueLookup[key],
  };
}

function createBindingsFromTimelineConfig(
  state: ControllerState,
  config: TimelineConfig,
): Record<string, MotionValue> {
  const valueLookup: Record<string, MotionValue> = {};
  const singleLayerProps = toLayerProps(config, TIMELINE_RESERVED_KEYS);
  const layers =
    config.layers?.map((layer) => ({
      target: layer.target,
      props: toLayerProps(layer, LAYER_RESERVED_KEYS),
      offset: layer.startTime ?? 0,
      duration: layer.duration,
    })) ??
    (config.target
      ? [
          {
            target: config.target,
            props: singleLayerProps,
            offset: 0,
            duration: config.duration,
          },
        ]
      : []);

  for (const layer of layers) {
    const binding = createLayerBinding(state, {
      target: layer.target,
      props: layer.props,
      offset: layer.offset,
      duration: layer.duration,
      defaultDuration: config.duration ?? DEFAULT_DURATION,
    });

    state.bindings.push(binding);
    for (const [property, channel] of Object.entries(binding.channels)) {
      if (channel.kind === 'motion-value') {
        valueLookup[property] = channel.source;
        continue;
      }
      if (!valueLookup[property]) {
        valueLookup[property] = binding.mirrors[property]!;
      }
    }
  }

  return valueLookup;
}

function inferTimelineDuration(config: TimelineConfig): number {
  if (typeof config.duration === 'number') {
    return config.duration;
  }

  const singleLayerProps = toLayerProps(config, TIMELINE_RESERVED_KEYS);
  const candidateLayers =
    config.layers?.map((layer) => ({
      props: toLayerProps(layer, LAYER_RESERVED_KEYS),
      offset: layer.startTime ?? 0,
      explicitDuration: layer.duration,
    })) ??
    (config.target
      ? [{ props: singleLayerProps, offset: 0, explicitDuration: config.duration }]
      : []);

  let duration = 0;

  for (const layer of candidateLayers) {
    let layerDuration = layer.explicitDuration ?? 0;

    for (const input of Object.values(layer.props)) {
      if (isMotionValue(input)) {
        continue;
      }
      if (typeof input === 'number') {
        layerDuration = Math.max(layerDuration, DEFAULT_DURATION);
        continue;
      }
      if (Array.isArray(input) && input.length > 0 && typeof input[0] === 'number') {
        layerDuration = Math.max(layerDuration, DEFAULT_DURATION);
        continue;
      }
      if (isKeyframeArray(input)) {
        layerDuration = Math.max(layerDuration, input[input.length - 1]?.time ?? 0);
        continue;
      }
      if (isFromToInput(input)) {
        layerDuration = Math.max(layerDuration, input.duration);
      }
    }

    duration = Math.max(duration, layer.offset + layerDuration);
  }

  return duration;
}

export function updateControllerFromSystem(binding: LayerBindingState, timestamp: number): void {
  syncControllerClock(binding.controller, timestamp, true);
  applyBindingFrame(binding);
}

export function createTimelineController(config: TimelineConfig): TimelineController {
  const duration = inferTimelineDuration(config);
  const state = createControllerState({
    duration,
    markers: config.markers,
    workArea: config.workArea,
  });
  createBindingsFromTimelineConfig(state, config);

  flushController(state);

  const controller = createTimelineControllerObject(state);
  if (config.autoplay !== false) {
    controller.play();
  }
  return controller;
}

export function createMotionController(
  target: AnimationTarget,
  props: MotionProps,
  options: MotionOptions = {},
): MotionController {
  const state = createControllerState({
    duration: options.duration ?? DEFAULT_DURATION,
    onUpdate: options.onUpdate,
    onComplete: options.onComplete,
  });

  const binding = createLayerBinding(state, {
    target,
    props,
    offset: options.delay ?? 0,
    duration: options.duration ?? DEFAULT_DURATION,
    defaultDuration: options.duration ?? DEFAULT_DURATION,
    defaultEasing: options.easing,
  });
  state.bindings.push(binding);

  const valueLookup: Record<string, MotionValue> = {};
  for (const [property, channel] of Object.entries(binding.channels)) {
    valueLookup[property] =
      channel.kind === 'motion-value' ? channel.source : binding.mirrors[property]!;
  }

  flushController(state);

  const controller = createMotionControllerObject(state, valueLookup);
  if (options.autoplay !== false) {
    controller.play();
  }
  return controller;
}
