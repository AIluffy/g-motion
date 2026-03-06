import { MotionStatus } from '@g-motion/core';
import { clamp, clamp01, getNowMs, lerp } from '@g-motion/shared';

import type { MotionValue } from '../motion-value';
import { value } from '../motion-value';
import type {
  AnimationLayerSnapshot,
  AnimationStateSnapshot,
  AnimationTarget,
  Keyframe,
  KeyframeInput,
  LayerController,
  MotionController,
  MotionOptions,
  MotionProps,
  TimelineConfig,
  TimelineController,
  TrackController,
} from '../facade/types';
import { ensureAnimationRuntime, flushAnimationRenderFrame } from '../runtime/bootstrap';
import type { LayerModel, TimelineAuthoringModel, TrackModel } from './authoring';
import {
  DEFAULT_DURATION,
  calculateTimelineDuration,
  createTimelineAuthoringModel,
  normalizeEditableCurve,
  recalculateLayer,
} from './authoring';
import { createAnimationStateStore, type AnimationStateStoreInternal } from './state';

const DEFAULT_WORK_AREA: [number, number] = [0, 0];

type PlaybackStatus = 'idle' | 'running' | 'paused' | 'finished';

interface LayerBindingState {
  entityId: number;
  controller: ControllerState;
  layer: LayerModel;
  rendererId: 'dom' | 'object';
  mirrors: Record<string, MotionValue>;
  motionValueUnsubscribers: Array<() => void>;
}

interface ControllerState {
  duration: number;
  currentTime: number;
  direction: 1 | -1;
  status: PlaybackStatus;
  startedAt: number;
  startedFrom: number;
  workArea: [number, number];
  timeMotionValue: MotionValue;
  progressMotionValue: MotionValue;
  bindings: LayerBindingState[];
  authoring: TimelineAuthoringModel;
  stateStore: AnimationStateStoreInternal;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
  completedNotified: boolean;
  lastSyncedAt: number;
  version: number;
  publishedVersion: number;
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

type MutableTimelineComponent = {
  duration: number;
  loop: number;
  repeat: number;
  version: number;
  rovingApplied: number;
};

type MutableAnimationBindingComponent = {
  state: LayerBindingState;
};

function now(): number {
  return getNowMs();
}

function isDomElement(target: AnimationTarget): target is Element {
  return typeof Element !== 'undefined' && target instanceof Element;
}

function isDomTarget(target: AnimationTarget): boolean {
  return typeof target === 'string' || isDomElement(target);
}

function writeNumericField(
  binding: LayerBindingState,
  componentName: string,
  fieldName: string,
  valueToWrite: number,
): void {
  const location = locateBinding(binding);
  if (!location) {
    return;
  }

  const buffer = location.archetype.getBuffer(componentName);
  const typedBuffer = location.archetype.getTypedBuffer(componentName, fieldName);
  const component = buffer?.[location.index] as Record<string, unknown> | undefined;

  if (component) {
    component[fieldName] = valueToWrite;
  }
  if (typedBuffer) {
    typedBuffer[location.index] = valueToWrite;
  }
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

function resolveEasing(easing?: Keyframe['easing']): ((value: number) => number) | undefined {
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

function sampleKeyframes(
  track: Extract<TrackModel['channel'], { kind: 'keyframes' }>,
  localTime: number,
): number {
  const { keyframes } = track;
  if (keyframes.length === 0) {
    return track.initialValue;
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
    const easing = resolveEasing(previous.easing);
    const eased = easing ? easing(progress) : progress;
    return lerp(previous.value, next.value, eased);
  }

  return keyframes[keyframes.length - 1]!.value;
}

function sampleChannel(track: TrackModel['channel'], localTime: number): number {
  if (track.kind === 'motion-value') {
    return track.source.get();
  }

  return sampleKeyframes(track, localTime);
}

function shallowEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => Object.is(left[key], right[key]));
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

function touchController(controller: ControllerState): void {
  controller.version += 1;
}

function buildLayerSnapshot(layer: LayerModel): AnimationLayerSnapshot {
  return {
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    startTime: layer.startTime,
    duration: layer.duration,
  };
}

function buildAnimationStateSnapshot(controller: ControllerState): AnimationStateSnapshot {
  const progress =
    controller.duration > 0 ? clamp01(controller.currentTime / controller.duration) : 0;
  const layers = controller.authoring.layers.map((layer) => buildLayerSnapshot(layer));
  const tracks = controller.authoring.layers.flatMap((layer) =>
    layer.trackOrder.map((property) => {
      const track = layer.tracks[property]!;
      return {
        layer: layer.name,
        property,
        keyframes:
          track.channel.kind === 'keyframes'
            ? track.channel.keyframes.map((keyframe) => ({ ...keyframe }))
            : [],
        currentValue: sampleChannel(track.channel, controller.currentTime - layer.startTime),
        isMotionValue: track.channel.kind === 'motion-value',
      };
    }),
  );

  return {
    duration: controller.duration,
    currentTime: controller.currentTime,
    progress,
    isPlaying: controller.status === 'running',
    markers: { ...controller.authoring.markers },
    workArea: [...controller.workArea] as [number, number],
    selectedLayer: controller.authoring.selectedLayer,
    layers,
    tracks,
  };
}

function publishControllerState(controller: ControllerState): void {
  if (controller.publishedVersion === controller.version) {
    return;
  }

  controller.stateStore.publish(buildAnimationStateSnapshot(controller));
  controller.publishedVersion = controller.version;
}

function createControllerState(params: {
  authoring: TimelineAuthoringModel;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}): ControllerState {
  const duration = calculateTimelineDuration(params.authoring);
  const workArea = normalizeWorkArea(params.authoring.workArea, duration);

  return {
    duration,
    currentTime: 0,
    direction: 1,
    status: 'idle',
    startedAt: 0,
    startedFrom: 0,
    workArea,
    timeMotionValue: value(0),
    progressMotionValue: value(0),
    bindings: [],
    authoring: params.authoring,
    stateStore: createAnimationStateStore({
      duration,
      currentTime: 0,
      progress: 0,
      isPlaying: false,
      markers: { ...params.authoring.markers },
      workArea: [...workArea] as [number, number],
      selectedLayer: params.authoring.selectedLayer,
      layers: [],
      tracks: [],
    }),
    onUpdate: params.onUpdate,
    onComplete: params.onComplete,
    completedNotified: false,
    lastSyncedAt: Number.NaN,
    version: 0,
    publishedVersion: -1,
  };
}

function setBindingStatus(binding: LayerBindingState, status: number): void {
  const { world } = ensureAnimationRuntime();
  const location = locateBinding(binding);
  if (!location) {
    return;
  }
  world.setMotionStatusAt(location.archetype, location.index, status);
}

function syncBindingMetadata(binding: LayerBindingState): void {
  const location = locateBinding(binding);
  if (!location) {
    return;
  }

  const motionStateBuffer = location.archetype.getBuffer('MotionState');
  const timelineBuffer = location.archetype.getBuffer('Timeline');
  const motionState = motionStateBuffer?.[location.index] as MutableMotionState | undefined;
  const timeline = timelineBuffer?.[location.index] as MutableTimelineComponent | undefined;

  if (motionState) {
    motionState.delay = binding.layer.startTime;
  }
  if (timeline) {
    timeline.duration = binding.layer.duration;
  }

  writeNumericField(binding, 'MotionState', 'delay', binding.layer.startTime);
  writeNumericField(binding, 'Timeline', 'duration', binding.layer.duration);
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
  motionState.delay = binding.layer.startTime;
  writeNumericField(binding, 'MotionState', 'currentTime', localTime);
  writeNumericField(binding, 'MotionState', 'playbackRate', binding.controller.direction);
  writeNumericField(binding, 'MotionState', 'delay', binding.layer.startTime);
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

  const localTime = binding.controller.currentTime - binding.layer.startTime;
  const nextProps: Record<string, number> = {};

  for (const property of binding.layer.trackOrder) {
    const track = binding.layer.tracks[property]!;
    const nextValue = sampleChannel(track.channel, localTime);
    nextProps[property] = nextValue;
    const mirror = binding.mirrors[property];
    if (mirror) {
      mirror.set(nextValue);
    }
  }

  updateBindingState(binding, localTime);

  if (!binding.layer.visible) {
    return;
  }

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

  const previousTime = controller.currentTime;
  const previousStatus = controller.status;
  const previousProgress =
    controller.duration > 0 ? clamp01(controller.currentTime / controller.duration) : 0;

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

  if (
    !Object.is(previousTime, controller.currentTime) ||
    !Object.is(previousProgress, progress) ||
    previousStatus !== controller.status
  ) {
    touchController(controller);
  }

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
  publishControllerState(controller);
  flushAnimationRenderFrame(timestamp);
}

function findBindingByLayer(controller: ControllerState, layerName: string): LayerBindingState {
  const binding = controller.bindings.find((candidate) => candidate.layer.name === layerName);
  if (!binding) {
    throw new Error(`Unknown layer: ${layerName}`);
  }
  return binding;
}

function refreshControllerDuration(controller: ControllerState): boolean {
  const previousTime = controller.currentTime;
  controller.duration = calculateTimelineDuration(controller.authoring);
  controller.workArea = normalizeWorkArea(controller.authoring.workArea, controller.duration);
  controller.currentTime = clamp(controller.currentTime, 0, controller.duration);
  controller.lastSyncedAt = Number.NaN;
  return previousTime !== controller.currentTime;
}

function flushBindingAfterAuthoringChange(binding: LayerBindingState): void {
  const controller = binding.controller;
  const timestamp = now();
  const timeClamped = refreshControllerDuration(controller);
  touchController(controller);

  if (timeClamped) {
    flushController(controller, timestamp);
    return;
  }

  syncBindingMetadata(binding);
  syncControllerClock(controller, timestamp, false);
  applyBindingFrame(binding);
  publishControllerState(controller);
  flushAnimationRenderFrame(timestamp);
}

function syncMotionValueBinding(binding: LayerBindingState): void {
  const controller = binding.controller;
  const timestamp = now();
  syncControllerClock(controller, timestamp, false);
  touchController(controller);
  applyBindingFrame(binding);
  publishControllerState(controller);
  flushAnimationRenderFrame(timestamp);
}

function createLayerBinding(controller: ControllerState, layer: LayerModel): LayerBindingState {
  const mirrors: Record<string, MotionValue> = {};
  const initialProps: Record<string, number> = {};

  for (const property of layer.trackOrder) {
    const track = layer.tracks[property]!;
    initialProps[property] = track.channel.initialValue;
    if (track.channel.kind === 'keyframes') {
      mirrors[property] = value(track.channel.initialValue);
    }
  }

  const { world } = ensureAnimationRuntime();
  const binding: LayerBindingState = {
    entityId: -1,
    controller,
    layer,
    rendererId: isDomTarget(layer.target) ? 'dom' : 'object',
    mirrors,
    motionValueUnsubscribers: [],
  };

  const entityId = world.createEntity({
    MotionState: {
      delay: layer.startTime,
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
      duration: layer.duration,
      loop: 0,
      repeat: 0,
      version: 0,
      rovingApplied: 0,
    },
    Render: {
      rendererId: binding.rendererId,
      rendererCode: 0,
      target: layer.target,
      props: initialProps,
      version: 1,
      renderedVersion: -1,
    },
    AnimationBinding: {
      state: binding,
    } satisfies MutableAnimationBindingComponent,
  });

  binding.entityId = entityId;
  for (const property of layer.trackOrder) {
    const track = layer.tracks[property]!;
    if (track.channel.kind !== 'motion-value') {
      continue;
    }

    binding.motionValueUnsubscribers.push(
      track.channel.source.onChange(() => syncMotionValueBinding(binding)),
    );
  }
  return binding;
}

function createBindingsFromAuthoring(
  state: ControllerState,
  authoring: TimelineAuthoringModel,
): Record<string, MotionValue> {
  const valueLookup: Record<string, MotionValue> = {};

  for (const layer of authoring.layers) {
    const binding = createLayerBinding(state, layer);
    state.bindings.push(binding);

    for (const property of layer.trackOrder) {
      const track = layer.tracks[property]!;
      if (track.channel.kind === 'motion-value') {
        valueLookup[property] = track.channel.source;
        continue;
      }

      if (!valueLookup[property]) {
        valueLookup[property] = binding.mirrors[property]!;
      }
    }
  }

  return valueLookup;
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
  touchController(controller);

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
  touchController(controller);
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
  touchController(controller);

  for (const binding of controller.bindings) {
    setBindingStatus(binding, MotionStatus.Idle);
  }

  flushController(controller);
}

function reversePlayback(controller: ControllerState): void {
  controller.direction = controller.direction > 0 ? -1 : 1;
  touchController(controller);
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
  touchController(controller);
  flushController(controller, timestamp);
}

function seekToMarker(controller: ControllerState, markerName: string): void {
  const marker = controller.authoring.markers[markerName];
  if (marker === undefined) {
    throw new Error(`Unknown marker: ${markerName}`);
  }
  seekPlayback(controller, marker);
}

function assertLayerUnlocked(layer: LayerModel): void {
  if (layer.locked) {
    throw new Error(`Layer is locked: ${layer.name}`);
  }
}

function assertCurveTrack(
  layer: LayerModel,
  property: string,
): Extract<TrackModel['channel'], { kind: 'keyframes' }> {
  const track = layer.tracks[property];
  if (!track) {
    throw new Error(`Unknown track "${property}" on layer "${layer.name}"`);
  }
  if (track.channel.kind !== 'keyframes') {
    throw new Error(`Track "${property}" on layer "${layer.name}" is bound to a MotionValue`);
  }
  return track.channel;
}

function createTrackController(
  state: ControllerState,
  layer: LayerModel,
  property: string,
): TrackController {
  if (!layer.tracks[property]) {
    throw new Error(`Unknown track "${property}" on layer "${layer.name}"`);
  }

  return {
    getCurve: () => {
      const track = layer.tracks[property];
      if (!track) {
        throw new Error(`Unknown track "${property}" on layer "${layer.name}"`);
      }
      return track.channel.kind === 'keyframes'
        ? track.channel.keyframes.map((keyframe) => ({ ...keyframe }))
        : [];
    },
    setCurve: (keyframes: KeyframeInput[]) => {
      assertLayerUnlocked(layer);
      assertCurveTrack(layer, property);
      const binding = findBindingByLayer(state, layer.name);
      layer.tracks[property] = {
        property,
        channel: normalizeEditableCurve(property, keyframes),
      };
      recalculateLayer(layer);
      flushBindingAfterAuthoringChange(binding);
    },
    insertKeyframe: (inputKeyframe: KeyframeInput) => {
      assertLayerUnlocked(layer);
      const binding = findBindingByLayer(state, layer.name);
      const curve = assertCurveTrack(layer, property);
      const nextKeyframe = normalizeEditableCurve(property, [inputKeyframe]).keyframes[0]!;
      const nextCurve = curve.keyframes.filter((keyframe) => keyframe.time !== nextKeyframe.time);
      nextCurve.push(nextKeyframe);
      layer.tracks[property] = {
        property,
        channel: normalizeEditableCurve(property, nextCurve),
      };
      recalculateLayer(layer);
      flushBindingAfterAuthoringChange(binding);
    },
    removeKeyframe: (time: number) => {
      assertLayerUnlocked(layer);
      const binding = findBindingByLayer(state, layer.name);
      const curve = assertCurveTrack(layer, property);
      const nextCurve = curve.keyframes.filter((keyframe) => keyframe.time !== time);
      if (nextCurve.length === curve.keyframes.length) {
        return;
      }
      if (nextCurve.length === 0) {
        throw new Error(
          `Track "${property}" on layer "${layer.name}" requires at least one keyframe`,
        );
      }
      layer.tracks[property] = {
        property,
        channel: normalizeEditableCurve(property, nextCurve),
      };
      recalculateLayer(layer);
      flushBindingAfterAuthoringChange(binding);
    },
  };
}

function createLayerController(state: ControllerState, layer: LayerModel): LayerController {
  return {
    show() {
      if (layer.visible) {
        return;
      }
      layer.visible = true;
      const binding = findBindingByLayer(state, layer.name);
      touchController(state);
      flushBindingAfterAuthoringChange(binding);
    },
    hide() {
      if (!layer.visible) {
        return;
      }
      layer.visible = false;
      touchController(state);
      publishControllerState(state);
    },
    lock() {
      if (layer.locked) {
        return;
      }
      layer.locked = true;
      touchController(state);
      publishControllerState(state);
    },
    unlock() {
      if (!layer.locked) {
        return;
      }
      layer.locked = false;
      touchController(state);
      publishControllerState(state);
    },
    get visible() {
      return layer.visible;
    },
    get locked() {
      return layer.locked;
    },
    get startTime() {
      return layer.startTime;
    },
    get duration() {
      return layer.duration;
    },
    move(delta: number) {
      assertLayerUnlocked(layer);
      layer.startTime = Math.max(0, layer.startTime + delta);
      const binding = findBindingByLayer(state, layer.name);
      flushBindingAfterAuthoringChange(binding);
    },
    track(property: string) {
      return createTrackController(state, layer, property);
    },
  };
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
        state.authoring.workArea = [...workArea] as [number, number];
        state.workArea = normalizeWorkArea(workArea, state.duration);
        state.currentTime = clamp(state.currentTime, state.workArea[0], state.workArea[1]);
        state.lastSyncedAt = Number.NaN;
        touchController(state);
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
    layer: (name: string) => {
      const layer = state.authoring.layers.find((candidate) => candidate.name === name);
      if (!layer) {
        throw new Error(`Unknown layer: ${name}`);
      }
      return createLayerController(state, layer);
    },
    bindState: () => state.stateStore.api,
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

export function updateControllerFromSystem(binding: LayerBindingState, timestamp: number): void {
  syncControllerClock(binding.controller, timestamp, true);
  applyBindingFrame(binding);
  publishControllerState(binding.controller);
}

export function createTimelineController(config: TimelineConfig): TimelineController {
  const authoring = createTimelineAuthoringModel(config);
  const state = createControllerState({
    authoring,
  });
  createBindingsFromAuthoring(state, authoring);

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
  const duration = options.duration ?? DEFAULT_DURATION;
  const authoring = createTimelineAuthoringModel({
    autoplay: false,
    layers: [
      {
        name: 'default',
        target,
        startTime: options.delay ?? 0,
        duration,
        ...props,
      },
    ],
  });
  const state = createControllerState({
    authoring,
    onUpdate: options.onUpdate,
    onComplete: options.onComplete,
  });

  const valueLookup = createBindingsFromAuthoring(state, authoring);

  flushController(state);

  const controller = createMotionControllerObject(state, valueLookup);
  if (options.autoplay !== false) {
    controller.play();
  }
  return controller;
}
