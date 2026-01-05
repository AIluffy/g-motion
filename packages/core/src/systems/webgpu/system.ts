/**
 * WebGPU Compute System
 *
 * Main entry point for GPU-accelerated animation compute.
 * Orchestrates initialization, pipeline management, and per-archetype dispatch.
 *
 * GPU-First Architecture:
 * - All animations attempt GPU compute by default
 * - Automatic CPU fallback when WebGPU is unavailable
 * - config.gpuCompute='never' explicitly disables GPU path
 *
 * Performance optimizations:
 * - Persistent GPU buffers (avoid per-frame allocation)
 * - Incremental updates (upload only changed data)
 * - Async readback with timeout management
 * - Buffer pooling and reuse
 */

import type { SystemContext, SystemDef } from '../../plugin';
import type { ArchetypeBatchDescriptor } from '../../types';
import { AsyncReadbackManager } from '../../webgpu/async-readback';
import { getWebGPUBufferManager, WebGPUBufferManager } from '../../webgpu/buffer';
import { createDebugger } from '@g-motion/utils';
import {
  getGPUChannelMappingRegistry,
  type ChannelMapping,
  isStandardTransformChannels,
} from '../../webgpu/channel-mapping';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../webgpu/custom-easing';
import {
  getPersistentGPUBufferManager,
  resetPersistentGPUBufferManager,
} from '../../webgpu/persistent-buffer-manager';
import { buildInterpolationShader } from '../../webgpu/shader';
import {
  ADVANCED_CULLING_OUTPUT_COMPACT_SHADER,
  ENTITY_BOUNDS_STRIDE,
  FRUSTUM_PLANES_FLOATS,
  RENDER_STATE_EX_STRIDE,
} from '../../webgpu/culling-shader';
import {
  OUTPUT_FORMAT_SHADER,
  OUTPUT_FORMAT,
  packOutputChannels,
  createStandardChannelMapping,
} from '../../webgpu/output-format-shader';
import {
  KEYFRAME_PREPROCESS_SHADER,
  KEYFRAME_SEARCH_SHADER,
  KEYFRAME_SEARCH_SHADER_OPT,
  KEYFRAME_INTERP_FROM_SEARCH_SHADER,
  RAW_KEYFRAME_STRIDE,
  PACKED_KEYFRAME_STRIDE,
  CHANNEL_MAP_STRIDE,
  SEARCH_RESULT_STRIDE,
} from '../../webgpu/keyframe-preprocess-shader';
import { StagingBufferPool } from '../../webgpu/staging-pool';
import { enqueueGPUResults, setPendingReadbackCount } from '../../webgpu/sync-manager';
import { getTimingHelper, TimingHelper } from '../../webgpu/timing-helper';
import { dispatchGPUBatch } from './dispatch';
import { initWebGPUCompute } from './initialization';
import { cachePipeline } from './pipeline';

let outputFormatPipeline: GPUComputePipeline | null = null;
let outputFormatBindGroupLayout: GPUBindGroupLayout | null = null;
let outputFormatPassEnabled = true;

let keyframePreprocessPipeline: GPUComputePipeline | null = null;
let keyframePreprocessBindGroupLayout: GPUBindGroupLayout | null = null;
let keyframeSearchPipeline: GPUComputePipeline | null = null;
let keyframeSearchBindGroupLayout: GPUBindGroupLayout | null = null;
let keyframeInterpPipeline: GPUComputePipeline | null = null;
let keyframeInterpBindGroupLayout: GPUBindGroupLayout | null = null;

let cullingCompactPipeline: GPUComputePipeline | null = null;
let cullingCompactBindGroupLayout: GPUBindGroupLayout | null = null;

const debugIO = createDebugger('WebGPU IO');

function isWebGPUIODebugEnabled(config: any): boolean {
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
  if (g && g.__MOTION_DEBUG_WEBGPU_IO__) return true;
  if (config && typeof config === 'object') {
    if (config.debugWebGPUIO === true) return true;
    const debugCfg = (config as any).debug;
    if (debugCfg && typeof debugCfg === 'object' && debugCfg.webgpuIO === true) return true;
  }
  return false;
}

function isWebGPUViewportCullingEnabled(config: any): boolean {
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
  if (g && g.__MOTION_WEBGPU_VIEWPORT_CULLING__) return true;
  if (config && typeof config === 'object') {
    const culling = (config as any).webgpuCulling;
    if (culling && typeof culling === 'object') {
      if (culling.enabled === true && culling.viewport !== false) return true;
      if (culling.viewport === true) return true;
    }
  }
  return false;
}

type Bounds = { centerX: number; centerY: number; centerZ: number; radius: number };

const _boundsCache = new WeakMap<object, { bounds: Bounds; ts: number }>();

function resolveViewportBounds(target: any, now: number): Bounds | null {
  if (!target || typeof target !== 'object') return null;
  const cached = _boundsCache.get(target);
  if (cached && now - cached.ts < 100) return cached.bounds;
  const anyTarget: any = target as any;
  const native =
    anyTarget && typeof anyTarget.getNativeTarget === 'function'
      ? anyTarget.getNativeTarget()
      : anyTarget;
  const el =
    typeof HTMLElement !== 'undefined' && native instanceof HTMLElement
      ? (native as HTMLElement)
      : null;
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  let rect: any = null;
  try {
    rect = el.getBoundingClientRect();
  } catch {
    rect = null;
  }
  if (!rect) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const r = Math.sqrt(rect.width * rect.width + rect.height * rect.height) / 2;
  const bounds = { centerX: cx, centerY: cy, centerZ: 0, radius: r };
  _boundsCache.set(target, { bounds, ts: now });
  return bounds;
}

function float32Preview(values: Float32Array, max: number): number[] {
  const n = Math.max(0, Math.min(values.length, max));
  return Array.from(values.subarray(0, n));
}

function firstEntityChannelPreview(
  values: Float32Array,
  stride: number,
  channels?: Array<{ index: number; property: string }>,
  maxChannels = 12,
): Record<string, number> {
  const out: Record<string, number> = {};
  const s = Math.max(1, stride | 0);
  const count = Math.min(s, maxChannels);
  for (let i = 0; i < count; i++) {
    const prop = channels?.[i]?.property ?? `ch${i}`;
    out[prop] = values[i] ?? 0;
  }
  return out;
}

export function enableGPUOutputFormatPass(): void {
  outputFormatPassEnabled = true;
}

export function disableGPUOutputFormatPass(): void {
  outputFormatPassEnabled = false;
}

function resolveKeyframeSearchOptimizedFlag(config: any, envOverride?: string | null): boolean {
  if (config && typeof config.keyframeSearchOptimized === 'boolean') {
    return config.keyframeSearchOptimized;
  }
  let envValue: string | undefined;
  if (typeof envOverride === 'string') {
    envValue = envOverride;
  } else {
    const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
    const env =
      g && g.process && g.process.env
        ? (g.process.env as Record<string, string | undefined>)
        : undefined;
    if (env) {
      envValue = env.MOTION_USE_OPTIMIZED_KEYFRAME_SHADER;
    }
  }
  if (typeof envValue === 'string') {
    const lower = envValue.toLowerCase();
    if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off') {
      return false;
    }
    return true;
  }
  return true;
}

let keyframeSearchOptimizedInUse: boolean | null = null;

export function __resolveKeyframeSearchOptimizedFlagForTests(
  config: any,
  envOverride?: string | null,
): boolean {
  return resolveKeyframeSearchOptimizedFlag(config, envOverride);
}

export function __getKeyframeSearchShaderModeForTests(): boolean | null {
  return keyframeSearchOptimizedInUse;
}

async function getOutputFormatPipeline(device: GPUDevice): Promise<GPUComputePipeline | null> {
  if (outputFormatPipeline && outputFormatBindGroupLayout) {
    return outputFormatPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: OUTPUT_FORMAT_SHADER,
    label: 'motion-output-format-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-output-format-bgl',
    entries: [
      {
        binding: 0,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 1,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 2,
        visibility: 4,
        buffer: { type: 'storage' as const },
      },
      {
        binding: 3,
        visibility: 4,
        buffer: { type: 'uniform' as const },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-output-format-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-output-format-pipeline',
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'formatOutputs',
    },
  });

  outputFormatBindGroupLayout = bindGroupLayout;
  outputFormatPipeline = pipeline;
  return pipeline;
}

async function getCullingCompactPipeline(device: GPUDevice): Promise<GPUComputePipeline | null> {
  if (cullingCompactPipeline && cullingCompactBindGroupLayout) {
    return cullingCompactPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: ADVANCED_CULLING_OUTPUT_COMPACT_SHADER,
    label: 'motion-culling-compact-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-culling-compact-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'uniform' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 4, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 5, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 6, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 7, visibility: 4, buffer: { type: 'uniform' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-culling-compact-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-culling-compact-pipeline',
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'cullAndCompact',
    },
  });

  cullingCompactBindGroupLayout = bindGroupLayout;
  cullingCompactPipeline = pipeline;
  return pipeline;
}

async function runOutputFormatPass(
  device: GPUDevice,
  queue: GPUQueue,
  rawOutputBuffer: GPUBuffer,
  usedRawValueCount: number,
  rawStride: number,
  outputChannels: ChannelMapping[] | undefined,
): Promise<GPUBuffer> {
  if (!outputFormatPassEnabled || !usedRawValueCount) {
    return rawOutputBuffer;
  }

  const pipeline = await getOutputFormatPipeline(device);
  if (!pipeline || !outputFormatBindGroupLayout) {
    return rawOutputBuffer;
  }

  const channelCount = outputChannels && outputChannels.length > 0 ? outputChannels.length : 0;
  if (!channelCount) {
    return rawOutputBuffer;
  }

  const safeRawStride = Math.max(1, Math.floor(rawStride) || channelCount);
  const entityCount = Math.max(0, Math.floor(usedRawValueCount / safeRawStride));
  const usedOutputValueCount = entityCount * channelCount;

  const channels: {
    sourceIndex: number;
    formatType: number;
    minValue: number;
    maxValue: number;
  }[] = new Array(channelCount);

  const useStandardMapping = outputChannels && isStandardTransformChannels(outputChannels);

  if (useStandardMapping) {
    const standard = createStandardChannelMapping();
    for (let i = 0; i < channelCount && i < standard.length; i++) {
      const s = standard[i];
      channels[i] = {
        sourceIndex: s.sourceIndex,
        formatType: s.formatType,
        minValue: s.minValue ?? 0,
        maxValue: s.maxValue ?? 1,
      };
    }
  } else if (outputChannels && outputChannels.length > 0) {
    let needsFormat = false;
    for (let i = 0; i < channelCount; i++) {
      const mapping = outputChannels[i];
      const sourceIndex =
        typeof mapping?.sourceIndex === 'number'
          ? mapping.sourceIndex
          : mapping
            ? mapping.index
            : i;
      const formatType =
        typeof mapping?.formatType === 'number' ? mapping.formatType : OUTPUT_FORMAT.FLOAT;
      const hasMin = typeof mapping?.minValue === 'number';
      const hasMax = typeof mapping?.maxValue === 'number';
      let minValue = hasMin ? (mapping!.minValue as number) : undefined;
      let maxValue = hasMax ? (mapping!.maxValue as number) : undefined;

      if (formatType === OUTPUT_FORMAT.FLOAT) {
        if (!hasMin && !hasMax) {
          minValue = 0;
          maxValue = 0;
        } else {
          if (!hasMin) minValue = 0;
          if (!hasMax) maxValue = 0;
        }
      } else {
        if (!hasMin) minValue = 0;
        if (!hasMax) maxValue = 1;
      }
      channels[i] = {
        sourceIndex,
        formatType,
        minValue: minValue ?? 0,
        maxValue: maxValue ?? 1,
      };
      if (!needsFormat) {
        if (safeRawStride !== channelCount) needsFormat = true;
        else if (sourceIndex !== i) needsFormat = true;
        else if (formatType !== OUTPUT_FORMAT.FLOAT) needsFormat = true;
        else if (typeof mapping?.minValue === 'number' && typeof mapping?.maxValue === 'number') {
          if (mapping.minValue < mapping.maxValue) needsFormat = true;
        }
      }
    }
    if (!needsFormat) {
      return rawOutputBuffer;
    }
  } else {
    return rawOutputBuffer;
  }

  const channelsData = packOutputChannels(channels);

  const channelsBuffer = device.createBuffer({
    size: channelsData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-output-format-channels',
  });

  queue.writeBuffer(channelsBuffer, 0, channelsData, 0, channelsData.byteLength);

  const paramsBuffer = device.createBuffer({
    size: 16,
    usage: (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-output-format-params',
  });
  const paramsData = new Uint32Array([
    usedRawValueCount >>> 0,
    safeRawStride >>> 0,
    channelCount >>> 0,
    0,
  ]);
  queue.writeBuffer(paramsBuffer, 0, paramsData.buffer, 0, paramsData.byteLength);

  const formattedBufferSize = usedOutputValueCount * 4;

  const formattedBuffer = device.createBuffer({
    size: formattedBufferSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: 'motion-output-format-formatted',
  });

  const cmdEncoder = device.createCommandEncoder({
    label: 'motion-output-format-encoder',
  });

  const pass = cmdEncoder.beginComputePass();

  const bindGroup = device.createBindGroup({
    layout: outputFormatBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: rawOutputBuffer } },
      { binding: 1, resource: { buffer: channelsBuffer } },
      { binding: 2, resource: { buffer: formattedBuffer } },
      { binding: 3, resource: { buffer: paramsBuffer } },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);

  const workgroupSize = 64;
  const workgroupsX = Math.ceil(usedOutputValueCount / workgroupSize);

  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();

  const commandBuffer = cmdEncoder.finish();
  queue.submit([commandBuffer]);

  channelsBuffer.destroy();
  paramsBuffer.destroy();

  return formattedBuffer;
}

async function runViewportCullingCompactionPass(
  device: GPUDevice,
  queue: GPUQueue,
  world: any,
  processor: any,
  archetypeId: string,
  batch: ArchetypeBatchDescriptor,
  rawOutputBuffer: GPUBuffer,
  rawStride: number,
): Promise<{
  entityCount: number;
  entityIds: Int32Array;
  leaseId?: number;
  outputBuffer: GPUBuffer;
}> {
  const pipeline = await getCullingCompactPipeline(device);
  if (!pipeline || !cullingCompactBindGroupLayout) {
    return {
      entityCount: batch.entityCount,
      entityIds: batch.entityIds as any,
      leaseId: (batch as any).entityIdsLeaseId as number | undefined,
      outputBuffer: rawOutputBuffer,
    };
  }

  const now = Date.now();
  const entityCount = batch.entityCount;
  const renderStatesBufferSize = entityCount * RENDER_STATE_EX_STRIDE * 4;
  const boundsBufferSize = entityCount * ENTITY_BOUNDS_STRIDE * 4;

  const statesAB = new ArrayBuffer(renderStatesBufferSize);
  const statesU32 = new Uint32Array(statesAB);
  const statesF32 = new Float32Array(statesAB);
  const boundsF32 = new Float32Array(entityCount * ENTITY_BOUNDS_STRIDE);

  const firstId = (batch.entityIds as any)[0] as number | undefined;
  const packetArchetype = firstId != null ? world.getEntityArchetype?.(firstId) : undefined;
  const stableArchetype =
    packetArchetype && packetArchetype.id === archetypeId ? packetArchetype : undefined;
  const stableRenderBuffer = stableArchetype ? stableArchetype.getBuffer?.('Render') : undefined;
  const stableIndices = stableArchetype
    ? (stableArchetype as any).getInternalEntityIndices?.()
    : undefined;
  const stableTypedRendererCode = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'rendererCode')
    : undefined;
  const stableTypedVersion = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'version')
    : undefined;
  const stableTypedRenderedVersion = stableArchetype
    ? stableArchetype.getTypedBuffer?.('Render', 'renderedVersion')
    : undefined;

  for (let i = 0; i < entityCount; i++) {
    const id = (batch.entityIds as any)[i] as number;
    const a = stableArchetype ?? world.getEntityArchetype?.(id);
    let rendererCode = 0;
    let version = 0;
    let renderedVersion = -1;
    let bounds: Bounds | null = null;
    if (a && typeof (a as any).getBuffer === 'function') {
      const renderBuffer = stableArchetype ? stableRenderBuffer : a.getBuffer?.('Render');
      const indices = stableArchetype ? stableIndices : (a as any).getInternalEntityIndices?.();
      const index = indices ? indices.get(id) : undefined;
      if (renderBuffer && index !== undefined) {
        const render = renderBuffer[index] as any;
        const typed = stableArchetype
          ? stableTypedRendererCode
          : a.getTypedBuffer?.('Render', 'rendererCode');
        rendererCode = typed ? typed[index] : (render?.rendererCode ?? 0);
        const typedV = stableArchetype
          ? stableTypedVersion
          : a.getTypedBuffer?.('Render', 'version');
        const typedRV = stableArchetype
          ? stableTypedRenderedVersion
          : a.getTypedBuffer?.('Render', 'renderedVersion');
        version = typedV ? typedV[index] : (render?.version ?? 0);
        renderedVersion = typedRV ? typedRV[index] : (render?.renderedVersion ?? -1);
        const b = render?.props?.__bounds as Bounds | undefined;
        if (
          b &&
          typeof b.centerX === 'number' &&
          typeof b.centerY === 'number' &&
          typeof b.radius === 'number'
        ) {
          bounds = b;
        } else {
          bounds = resolveViewportBounds(render?.target, now);
        }
      }
    } else if (a && typeof (a as any).getEntityData === 'function') {
      const render = (a as any).getEntityData(id, 'Render');
      if (render) {
        rendererCode = render.rendererCode ?? 0;
        version = render.version ?? 0;
        renderedVersion = render.renderedVersion ?? -1;
        const b = render?.props?.__bounds as Bounds | undefined;
        if (
          b &&
          typeof b.centerX === 'number' &&
          typeof b.centerY === 'number' &&
          typeof b.radius === 'number'
        ) {
          bounds = b;
        } else {
          bounds = resolveViewportBounds(render?.target, now);
        }
      }
    }

    const base = i * RENDER_STATE_EX_STRIDE;
    statesU32[base + 0] = id >>> 0;
    statesU32[base + 1] = version >>> 0;
    statesU32[base + 2] = renderedVersion >>> 0;
    statesU32[base + 3] = 1;
    statesU32[base + 4] = rendererCode >>> 0;
    statesF32[base + 5] = 0;
    statesF32[base + 6] = batch.statesData[i * 4 + 1] ?? 0;
    statesU32[base + 7] = 0;

    const bb = i * ENTITY_BOUNDS_STRIDE;
    if (bounds) {
      boundsF32[bb + 0] = bounds.centerX;
      boundsF32[bb + 1] = bounds.centerY;
      boundsF32[bb + 2] = bounds.centerZ ?? 0;
      boundsF32[bb + 3] = bounds.radius;
    } else {
      boundsF32[bb + 0] = 0;
      boundsF32[bb + 1] = 0;
      boundsF32[bb + 2] = 0;
      boundsF32[bb + 3] = 0;
    }
  }

  const frustumF32 = new Float32Array(FRUSTUM_PLANES_FLOATS);
  const w = typeof (globalThis as any).innerWidth === 'number' ? (globalThis as any).innerWidth : 0;
  const h =
    typeof (globalThis as any).innerHeight === 'number' ? (globalThis as any).innerHeight : 0;
  frustumF32.set(
    [1, 0, 0, 0, -1, 0, 0, w, 0, 1, 0, 0, 0, -1, 0, h, 0, 0, 1, 1e9, 0, 0, -1, 1e9],
    0,
  );

  const paramsU32 = new Uint32Array(4);
  paramsU32[0] = Math.max(1, rawStride | 0) >>> 0;

  const renderStatesGPU = device.createBuffer({
    size: renderStatesBufferSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-states-${archetypeId}`,
  });
  const boundsGPU = device.createBuffer({
    size: boundsBufferSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-bounds-${archetypeId}`,
  });
  const frustumGPU = device.createBuffer({
    size: frustumF32.byteLength,
    usage: (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-frustum-${archetypeId}`,
  });
  const paramsGPU = device.createBuffer({
    size: paramsU32.byteLength,
    usage: (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-params-${archetypeId}`,
  });

  const compactedOutputsGPU = device.createBuffer({
    size: entityCount * Math.max(1, rawStride | 0) * 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-cull-compacted-outputs-${archetypeId}`,
  });

  const compactedEntityIdsGPU = device.createBuffer({
    size: entityCount * 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-cull-compacted-ids-${archetypeId}`,
  });

  const visibleCountGPU = device.createBuffer({
    size: 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-visible-count-${archetypeId}`,
  });

  queue.writeBuffer(renderStatesGPU, 0, statesU32.buffer, 0, statesU32.byteLength);
  queue.writeBuffer(boundsGPU, 0, boundsF32.buffer, 0, boundsF32.byteLength);
  queue.writeBuffer(frustumGPU, 0, frustumF32.buffer, 0, frustumF32.byteLength);
  queue.writeBuffer(paramsGPU, 0, paramsU32.buffer, 0, paramsU32.byteLength);
  queue.writeBuffer(visibleCountGPU, 0, new Uint32Array([0]).buffer, 0, 4);

  const bindGroup = device.createBindGroup({
    layout: cullingCompactBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: renderStatesGPU } },
      { binding: 1, resource: { buffer: boundsGPU } },
      { binding: 2, resource: { buffer: frustumGPU } },
      { binding: 3, resource: { buffer: rawOutputBuffer } },
      { binding: 4, resource: { buffer: compactedOutputsGPU } },
      { binding: 5, resource: { buffer: compactedEntityIdsGPU } },
      { binding: 6, resource: { buffer: visibleCountGPU } },
      { binding: 7, resource: { buffer: paramsGPU } },
    ],
  });

  const countReadback = device.createBuffer({
    size: 4,
    usage: (GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-count-readback-${archetypeId}`,
  });
  const idsReadback = device.createBuffer({
    size: entityCount * 4,
    usage: (GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-cull-ids-readback-${archetypeId}`,
  });

  const encoder = device.createCommandEncoder({ label: `motion-cull-compact-${archetypeId}` });
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupsX = Math.ceil(entityCount / 64);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();
  encoder.copyBufferToBuffer(visibleCountGPU, 0, countReadback, 0, 4);
  encoder.copyBufferToBuffer(compactedEntityIdsGPU, 0, idsReadback, 0, entityCount * 4);
  queue.submit([encoder.finish()]);

  await Promise.all([
    countReadback.mapAsync((GPUMapMode as any).READ),
    idsReadback.mapAsync((GPUMapMode as any).READ),
  ]);
  const countU32 = new Uint32Array(countReadback.getMappedRange());
  const visibleCount = Math.min(entityCount, countU32[0] >>> 0);
  const idsU32 = new Uint32Array(idsReadback.getMappedRange());

  let compactLeaseId: number | undefined;
  let compactEntityIds: Int32Array;
  if (visibleCount > 0) {
    const lease = processor.acquireEntityIds(visibleCount);
    compactLeaseId = lease.leaseId;
    compactEntityIds = lease.buffer.subarray(0, visibleCount);
    compactEntityIds.set(idsU32.subarray(0, visibleCount));
  } else {
    compactEntityIds = new Int32Array(0);
  }

  countReadback.unmap();
  idsReadback.unmap();
  countReadback.destroy();
  idsReadback.destroy();
  renderStatesGPU.destroy();
  boundsGPU.destroy();
  frustumGPU.destroy();
  paramsGPU.destroy();
  visibleCountGPU.destroy();
  compactedEntityIdsGPU.destroy();

  if (typeof (batch as any).entityIdsLeaseId === 'number') {
    processor.releaseEntityIds((batch as any).entityIdsLeaseId);
  }

  return {
    entityCount: visibleCount,
    entityIds: compactEntityIds,
    leaseId: compactLeaseId,
    outputBuffer: compactedOutputsGPU,
  };
}

async function getKeyframePreprocessPipeline(
  device: GPUDevice,
): Promise<GPUComputePipeline | null> {
  if (keyframePreprocessPipeline && keyframePreprocessBindGroupLayout) {
    return keyframePreprocessPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: KEYFRAME_PREPROCESS_SHADER,
    label: 'motion-keyframe-preprocess-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-preprocess-bgl',
    entries: [
      {
        binding: 0,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 1,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 2,
        visibility: 4,
        buffer: { type: 'storage' as const },
      },
      {
        binding: 3,
        visibility: 4,
        buffer: { type: 'storage' as const },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-preprocess-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-keyframe-preprocess-pipeline',
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'packKeyframes',
    },
  });

  keyframePreprocessBindGroupLayout = bindGroupLayout;
  keyframePreprocessPipeline = pipeline;
  return pipeline;
}

async function getKeyframeSearchPipeline(
  device: GPUDevice,
  useOptimizedShader: boolean,
): Promise<GPUComputePipeline | null> {
  if (keyframeSearchPipeline && keyframeSearchBindGroupLayout) {
    return keyframeSearchPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: useOptimizedShader ? KEYFRAME_SEARCH_SHADER_OPT : KEYFRAME_SEARCH_SHADER,
    label: useOptimizedShader
      ? 'motion-keyframe-search-shader-opt'
      : 'motion-keyframe-search-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-search-bgl',
    entries: [
      {
        binding: 0,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 1,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 2,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 3,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 4,
        visibility: 4,
        buffer: { type: 'storage' as const },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-search-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: useOptimizedShader
      ? 'motion-keyframe-search-pipeline-opt'
      : 'motion-keyframe-search-pipeline',
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'findActiveKeyframes',
    },
  });

  keyframeSearchBindGroupLayout = bindGroupLayout;
  keyframeSearchPipeline = pipeline;
  keyframeSearchOptimizedInUse = useOptimizedShader;
  try {
    const mode = useOptimizedShader ? 'optimized' : 'baseline';
    console.info('[Motion][WebGPUComputeSystem] keyframe search shader mode', mode);
  } catch {}
  return pipeline;
}

async function getKeyframeInterpPipeline(device: GPUDevice): Promise<GPUComputePipeline | null> {
  if (keyframeInterpPipeline && keyframeInterpBindGroupLayout) {
    return keyframeInterpPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: KEYFRAME_INTERP_FROM_SEARCH_SHADER,
    label: 'motion-keyframe-interp-from-search-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-interp-from-search-bgl',
    entries: [
      {
        binding: 0,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 1,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 2,
        visibility: 4,
        buffer: { type: 'read-only-storage' as const },
      },
      {
        binding: 3,
        visibility: 4,
        buffer: { type: 'storage' as const },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-interp-from-search-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-keyframe-interp-from-search-pipeline',
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'interpolateFromSearch',
    },
  });

  keyframeInterpBindGroupLayout = bindGroupLayout;
  keyframeInterpPipeline = pipeline;
  return pipeline;
}

interface KeyframePreprocessResult {
  packedKeyframesBuffer: GPUBuffer;
  rawKeyframeData: Float32Array;
  mapData: Uint32Array;
  entityIndexByEntry: Uint32Array;
  channelIndexByEntry: Uint32Array;
}

interface KeyframeSearchResultGPU {
  searchResultsBuffer: GPUBuffer;
  outputIndicesData: Uint32Array;
  entryCount: number;
}

async function runKeyframeSearchPass(
  device: GPUDevice,
  queue: GPUQueue,
  preprocess: KeyframePreprocessResult,
  statesData: Float32Array,
  channelCount: number,
  useOptimizedShader: boolean,
): Promise<KeyframeSearchResultGPU | null> {
  const rawCount = preprocess.rawKeyframeData.length / RAW_KEYFRAME_STRIDE;
  const entryCount = preprocess.mapData.length / CHANNEL_MAP_STRIDE;
  if (!rawCount || !entryCount) {
    return null;
  }

  const keyframeOffsets = new Uint32Array(entryCount);
  const keyframeCounts = new Uint32Array(entryCount);
  const searchTimes = new Float32Array(entryCount);
  const outputIndicesData = new Uint32Array(entryCount);

  for (let j = 0; j < entryCount; j++) {
    const base = j * CHANNEL_MAP_STRIDE;
    keyframeOffsets[j] = preprocess.mapData[base + 2];
    keyframeCounts[j] = preprocess.mapData[base + 3];

    const entityIndex = preprocess.entityIndexByEntry[j] >>> 0;
    const channelIndex = preprocess.channelIndexByEntry[j] >>> 0;

    const stateOffset = entityIndex * 4;
    const currentTime = statesData[stateOffset + 1] ?? 0;
    const playbackRate = statesData[stateOffset + 2] ?? 0;
    const adjustedTime = currentTime * playbackRate;

    searchTimes[j] = adjustedTime;
    outputIndicesData[j] = entityIndex * channelCount + channelIndex;
  }

  const searchTimesBuffer = device.createBuffer({
    size: searchTimes.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-times',
  });

  const keyframeOffsetsBuffer = device.createBuffer({
    size: keyframeOffsets.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-offsets',
  });

  const keyframeCountsBuffer = device.createBuffer({
    size: keyframeCounts.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-counts',
  });

  const searchResultsBuffer = device.createBuffer({
    size: entryCount * SEARCH_RESULT_STRIDE * 4,
    usage: GPUBufferUsage.STORAGE as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-results',
  });

  queue.writeBuffer(searchTimesBuffer, 0, searchTimes.buffer, 0, searchTimes.byteLength);
  queue.writeBuffer(
    keyframeOffsetsBuffer,
    0,
    keyframeOffsets.buffer,
    0,
    keyframeOffsets.byteLength,
  );
  queue.writeBuffer(keyframeCountsBuffer, 0, keyframeCounts.buffer, 0, keyframeCounts.byteLength);

  const pipeline = await getKeyframeSearchPipeline(device, useOptimizedShader);
  if (!pipeline || !keyframeSearchBindGroupLayout) {
    searchTimesBuffer.destroy();
    keyframeOffsetsBuffer.destroy();
    keyframeCountsBuffer.destroy();
    searchResultsBuffer.destroy();
    return null;
  }

  const bindGroup = device.createBindGroup({
    layout: keyframeSearchBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: preprocess.packedKeyframesBuffer } },
      { binding: 1, resource: { buffer: searchTimesBuffer } },
      { binding: 2, resource: { buffer: keyframeOffsetsBuffer } },
      { binding: 3, resource: { buffer: keyframeCountsBuffer } },
      { binding: 4, resource: { buffer: searchResultsBuffer } },
    ],
  });

  const cmdEncoder = device.createCommandEncoder({
    label: 'motion-keyframe-search-encoder',
  });

  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupSize = 64;
  const workgroupsX = Math.ceil(entryCount / workgroupSize);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();

  const commandBuffer = cmdEncoder.finish();
  queue.submit([commandBuffer]);

  searchTimesBuffer.destroy();
  keyframeOffsetsBuffer.destroy();
  keyframeCountsBuffer.destroy();

  return {
    searchResultsBuffer,
    outputIndicesData,
    entryCount,
  };
}

async function runKeyframeInterpPass(
  device: GPUDevice,
  queue: GPUQueue,
  packedKeyframesBuffer: GPUBuffer,
  searchResultsBuffer: GPUBuffer,
  outputIndicesData: Uint32Array,
  entryCount: number,
  entityCount: number,
  channelCount: number,
  archetypeId: string,
): Promise<GPUBuffer | null> {
  if (!entryCount || !entityCount || !channelCount) {
    packedKeyframesBuffer.destroy();
    searchResultsBuffer.destroy();
    return null;
  }

  const outputIndicesBuffer = device.createBuffer({
    size: outputIndicesData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-keyframe-interp-output-indices-${archetypeId}`,
  });

  const outputsSize = entityCount * channelCount * 4;
  const outputBuffer = device.createBuffer({
    size: outputsSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-keyframe-interp-outputs-${archetypeId}`,
  });

  queue.writeBuffer(
    outputIndicesBuffer,
    0,
    outputIndicesData.buffer,
    0,
    outputIndicesData.byteLength,
  );

  const pipeline = await getKeyframeInterpPipeline(device);
  if (!pipeline || !keyframeInterpBindGroupLayout) {
    packedKeyframesBuffer.destroy();
    searchResultsBuffer.destroy();
    outputIndicesBuffer.destroy();
    outputBuffer.destroy();
    return null;
  }

  const bindGroup = device.createBindGroup({
    layout: keyframeInterpBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: packedKeyframesBuffer } },
      { binding: 1, resource: { buffer: searchResultsBuffer } },
      { binding: 2, resource: { buffer: outputIndicesBuffer } },
      { binding: 3, resource: { buffer: outputBuffer } },
    ],
  });

  const cmdEncoder = device.createCommandEncoder({
    label: `motion-keyframe-interp-encoder-${archetypeId}`,
  });

  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupSize = 64;
  const workgroupsX = Math.ceil(entryCount / workgroupSize);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();

  const commandBuffer = cmdEncoder.finish();
  queue.submit([commandBuffer]);

  packedKeyframesBuffer.destroy();
  searchResultsBuffer.destroy();
  outputIndicesBuffer.destroy();

  return outputBuffer;
}

async function runKeyframePreprocessPass(
  device: GPUDevice,
  queue: GPUQueue,
  batch: ArchetypeBatchDescriptor,
): Promise<KeyframePreprocessResult | null> {
  const preprocessed = batch.preprocessedKeyframes;
  if (!preprocessed) {
    return null;
  }
  const rawPerEntity = preprocessed.rawKeyframesPerEntity;
  const mapPerEntity = preprocessed.channelMapPerEntity;
  if (!rawPerEntity.length || !mapPerEntity.length) {
    return null;
  }

  let totalRawKeyframes = 0;
  let totalChannelMaps = 0;
  for (let i = 0; i < rawPerEntity.length; i++) {
    const raw = rawPerEntity[i];
    const maps = mapPerEntity[i];
    if (raw && raw.length) {
      totalRawKeyframes += raw.length / RAW_KEYFRAME_STRIDE;
    }
    if (maps && maps.length) {
      totalChannelMaps += maps.length / CHANNEL_MAP_STRIDE;
    }
  }

  if (!totalRawKeyframes || !totalChannelMaps) {
    return null;
  }

  const rawData = new Float32Array(totalRawKeyframes * RAW_KEYFRAME_STRIDE);
  const mapData = new Uint32Array(totalChannelMaps * CHANNEL_MAP_STRIDE);
  const entityIndexByEntry = new Uint32Array(totalChannelMaps);
  const channelIndexByEntry = new Uint32Array(totalChannelMaps);

  let rawBase = 0;
  let mapIndex = 0;

  for (let i = 0; i < rawPerEntity.length; i++) {
    const raw = rawPerEntity[i];
    const maps = mapPerEntity[i];
    const rawCount = raw.length ? raw.length / RAW_KEYFRAME_STRIDE : 0;
    const mapCount = maps.length ? maps.length / CHANNEL_MAP_STRIDE : 0;

    if (rawCount) {
      rawData.set(raw, rawBase * RAW_KEYFRAME_STRIDE);
    }

    for (let j = 0; j < mapCount; j++) {
      const srcOffset = j * CHANNEL_MAP_STRIDE;
      const dstOffset = mapIndex * CHANNEL_MAP_STRIDE;
      const propertyHash = maps[srcOffset + 0];
      const channelIndex = maps[srcOffset + 1];
      const entityOffsetLocal = maps[srcOffset + 2];
      const keyframeCount = maps[srcOffset + 3];
      mapData[dstOffset + 0] = propertyHash;
      mapData[dstOffset + 1] = channelIndex;
      mapData[dstOffset + 2] = entityOffsetLocal + rawBase;
      mapData[dstOffset + 3] = keyframeCount;
      entityIndexByEntry[mapIndex] = i;
      channelIndexByEntry[mapIndex] = channelIndex;
      mapIndex++;
    }

    rawBase += rawCount;
  }

  const rawKeyframesBuffer = device.createBuffer({
    size: rawData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-raw-keyframes-${batch.archetypeId}`,
  });

  const channelMapsBuffer = device.createBuffer({
    size: mapData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-channel-maps-${batch.archetypeId}`,
  });

  const packedKeyframesBuffer = device.createBuffer({
    size: totalRawKeyframes * PACKED_KEYFRAME_STRIDE * 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-packed-keyframes-${batch.archetypeId}`,
  });

  const keyframeIndicesBuffer = device.createBuffer({
    size: Math.max(totalRawKeyframes * 4, 4),
    usage: GPUBufferUsage.STORAGE as number,
    mappedAtCreation: false,
    label: `motion-keyframe-indices-${batch.archetypeId}`,
  });

  queue.writeBuffer(rawKeyframesBuffer, 0, rawData.buffer, 0, rawData.byteLength);
  queue.writeBuffer(channelMapsBuffer, 0, mapData.buffer, 0, mapData.byteLength);

  const pipeline = await getKeyframePreprocessPipeline(device);
  if (!pipeline || !keyframePreprocessBindGroupLayout) {
    rawKeyframesBuffer.destroy();
    channelMapsBuffer.destroy();
    packedKeyframesBuffer.destroy();
    keyframeIndicesBuffer.destroy();
    return null;
  }

  const bindGroup = device.createBindGroup({
    layout: keyframePreprocessBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: rawKeyframesBuffer } },
      { binding: 1, resource: { buffer: channelMapsBuffer } },
      { binding: 2, resource: { buffer: packedKeyframesBuffer } },
      { binding: 3, resource: { buffer: keyframeIndicesBuffer } },
    ],
  });

  const cmdEncoder = device.createCommandEncoder({
    label: `motion-keyframe-preprocess-encoder-${batch.archetypeId}`,
  });

  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupSize = 64;
  const workgroupsX = Math.ceil(totalRawKeyframes / workgroupSize);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();

  const commandBuffer = cmdEncoder.finish();
  queue.submit([commandBuffer]);

  rawKeyframesBuffer.destroy();
  channelMapsBuffer.destroy();
  keyframeIndicesBuffer.destroy();

  return {
    packedKeyframesBuffer,
    rawKeyframeData: rawData,
    mapData,
    entityIndexByEntry,
    channelIndexByEntry,
  };
}

// Sentinel value to track initialization
let bufferManager: WebGPUBufferManager | null = null;
let isInitialized = false;
let deviceAvailable = false;
let shaderVersion = -1;
let timingHelper: TimingHelper | null = null;
let stagingPool: StagingBufferPool | null = null;
let readbackManager: AsyncReadbackManager | null = null;

// Track if we've logged the fallback message
let cpuFallbackLogged = false;

export function __resetWebGPUComputeSystemForTests(): void {
  bufferManager = null;
  isInitialized = false;
  deviceAvailable = false;
  shaderVersion = -1;
  timingHelper = null;
  stagingPool = null;
  readbackManager = null;
  cpuFallbackLogged = false;
  resetPersistentGPUBufferManager();
  setPendingReadbackCount(0);
}

/**
 * WebGPU Compute System with Per-Archetype Dispatch
 *
 * GPU-First Architecture:
 * - Attempts GPU compute for all animations by default
 * - Falls back to CPU (InterpolationSystem) when GPU unavailable
 * - No threshold checks - GPU is always preferred when available
 *
 * This system:
 * 1. Receives per-archetype batches from BatchSamplingSystem
 * 2. Uploads data to GPU buffers (shared or persistent)
 * 3. Dispatches compute shader once per archetype with tuned workgroup size
 * 4. Records dispatch metrics for monitoring
 */
export const WebGPUComputeSystem: SystemDef = {
  name: 'WebGPUComputeSystem',
  order: 6, // Run after BatchSamplingSystem (order 5)

  async update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world as any;
    const metricsProvider = ctx?.services.metrics;
    const processor = ctx?.services.batchProcessor;
    const config = ctx?.services.config as any;
    const debugIOEnabled = isWebGPUIODebugEnabled(config);

    if (!metricsProvider || !processor || !config) {
      return;
    }

    // Explicit GPU disable check
    const gpuMode = config.gpuCompute ?? 'auto';
    if (gpuMode === 'never') {
      // CPU fallback is handled by InterpolationSystem
      metricsProvider.updateStatus({ cpuFallbackActive: true, enabled: false });
      setPendingReadbackCount(0);
      return;
    }

    // Lazy initialization
    if (!isInitialized) {
      bufferManager = getWebGPUBufferManager();
      const initResult = await initWebGPUCompute(bufferManager);
      isInitialized = true;
      deviceAvailable = initResult.deviceAvailable;
      shaderVersion = initResult.shaderVersion;

      if (deviceAvailable && bufferManager) {
        const device = bufferManager.getDevice();
        timingHelper = getTimingHelper(device);
        const pipeline = (bufferManager as any).computePipeline;
        if (pipeline) {
          cachePipeline(64, pipeline);
        }
        stagingPool = new StagingBufferPool(device);
        readbackManager = new AsyncReadbackManager();
        // Initialize persistent buffer manager
        getPersistentGPUBufferManager(device);

        // Update metrics to indicate GPU is available and enabled
        metricsProvider.updateStatus({
          webgpuAvailable: true,
          gpuInitialized: true,
          enabled: true,
          cpuFallbackActive: false,
        });
      } else {
        // GPU not available - CPU fallback will be used
        if (!cpuFallbackLogged) {
          console.info('[Motion] WebGPU not available, using CPU fallback for animations');
          cpuFallbackLogged = true;
        }
        metricsProvider.updateStatus({
          webgpuAvailable: false,
          gpuInitialized: false,
          enabled: false,
          cpuFallbackActive: true,
        });
      }
    }

    // GPU not available - InterpolationSystem handles CPU fallback
    if (!bufferManager || !deviceAvailable) {
      setPendingReadbackCount(0);
      return;
    }

    const device = bufferManager.getDevice();

    if (!device) {
      metricsProvider.updateStatus({ cpuFallbackActive: true });
      setPendingReadbackCount(0);
      return;
    }

    // Rebuild pipeline if custom easing set changed
    const currentVersion = getCustomEasingVersion();

    if (currentVersion !== shaderVersion) {
      const bindGroupLayoutEntries = [
        {
          binding: 0,
          visibility: 4, // GPUShaderStage.COMPUTE = 4
          buffer: { type: 'storage' as const }, // states
        },
        {
          binding: 1,
          visibility: 4, // GPUShaderStage.COMPUTE = 4
          buffer: { type: 'read-only-storage' as const }, // keyframes
        },
        {
          binding: 2,
          visibility: 4, // GPUShaderStage.COMPUTE = 4
          buffer: { type: 'storage' as const }, // outputs
        },
      ];

      const success = await bufferManager.initComputePipeline({
        shaderCode: buildInterpolationShader(getCustomGpuEasings()),
        bindGroupLayoutEntries,
      });

      if (success) {
        const pipeline = (bufferManager as any).computePipeline;
        if (pipeline) {
          cachePipeline(64, pipeline);
        }
        shaderVersion = currentVersion;
      }
    }

    const keyframePreprocessConfig = (config as any).keyframePreprocess as
      | { enabled?: boolean }
      | undefined;
    const preprocessEnabled = !!keyframePreprocessConfig?.enabled;

    // Process completed readbacks
    if (readbackManager) {
      const rb = readbackManager;
      // Limit readback processing to 2ms per frame to prevent blocking
      rb.drainCompleted(2).then((results) => {
        for (const res of results) {
          const values = res.values;
          if (debugIOEnabled && values && values.length) {
            const stride = typeof res.stride === 'number' ? res.stride : 1;
            debugIO('output', {
              archetypeId: res.archetypeId,
              entityCount: (res.entityIds as any).length ?? 0,
              stride,
              expired: !!res.expired,
              channels: res.channels?.map((c) => c.property) ?? undefined,
              firstEntity: firstEntityChannelPreview(values, stride, res.channels),
              valuesPreview: float32Preview(values, Math.min(64, stride * 4)),
            });
          }
          if (values && values.length) {
            enqueueGPUResults({
              archetypeId: res.archetypeId,
              entityIds: res.entityIds,
              values,
              stride: res.stride,
              channels: res.channels,
            });
          }

          try {
            metricsProvider.recordMetric({
              batchId: `${res.archetypeId}-sync`,
              entityCount: res.entityIds.length,
              timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
              gpu: true,
              syncPerformed: true,
              syncDurationMs: res.syncDurationMs ?? 0,
              syncDataSize: res.byteSize,
            });
          } catch {
            // ignore
          }

          stagingPool!.markAvailable(res.stagingBuffer);

          if (typeof res.leaseId === 'number') {
            processor.releaseEntityIds(res.leaseId);
          }
        }
        setPendingReadbackCount(rb.getPendingCount());
      });
      setPendingReadbackCount(rb.getPendingCount());
    }

    // GPU-First: Always process batches when GPU is available
    // No threshold checks - GPU is preferred for all animations
    metricsProvider.updateStatus({ enabled: true, cpuFallbackActive: false });

    // Get all per-archetype batches prepared by BatchSamplingSystem
    const archetypeBatches = processor.getArchetypeBatches();
    if (archetypeBatches.size === 0 || !stagingPool) {
      return;
    }

    const queue = device.queue;
    const channelRegistry = getGPUChannelMappingRegistry();
    const useOptimizedKeyframeSearch = resolveKeyframeSearchOptimizedFlag(config);
    const viewportCullingEnabled = !!world && isWebGPUViewportCullingEnabled(config);

    for (const [archetypeId, batch] of archetypeBatches) {
      let leaseId = (batch as any).entityIdsLeaseId as number | undefined;
      const table = channelRegistry.getChannels(archetypeId);
      const outputChannels = table?.channels ?? [];
      const rawChannels = table?.rawChannels ?? outputChannels;
      const rawStride = table?.rawStride ?? (rawChannels.length || 1);
      const outputStride = table?.stride ?? (outputChannels.length || 1);

      try {
        if (debugIOEnabled) {
          debugIO('input', {
            archetypeId,
            entityCount: batch.entityCount,
            workgroupHint: batch.workgroupHint,
            keyframesVersion: batch.keyframesVersion,
            rawStride,
            outputStride,
            rawChannels: rawChannels.slice(0, 24).map((c) => c.property),
            outputChannels: outputChannels.slice(0, 24).map((c) => c.property),
            statesPreview: float32Preview(batch.statesData, Math.min(32, batch.entityCount * 4)),
            keyframesPreview: float32Preview(batch.keyframesData, 40),
            preprocessed: batch.preprocessedKeyframes
              ? {
                  rawKeyframesPerEntity: batch.preprocessedKeyframes.rawKeyframesPerEntity.map(
                    (a) => a.length,
                  ),
                  channelMapPerEntity: batch.preprocessedKeyframes.channelMapPerEntity.map(
                    (a) => a.length,
                  ),
                }
              : undefined,
          });
        }

        let outputBuffer: GPUBuffer | null = null;
        let entityCount = batch.entityCount;
        let entityIdsForReadback: ArrayLike<number> = batch.entityIds;

        if (preprocessEnabled && batch.preprocessedKeyframes && rawStride > 0) {
          const preprocessResult = await runKeyframePreprocessPass(device, queue, batch);
          if (preprocessResult) {
            const searchResult = await runKeyframeSearchPass(
              device,
              queue,
              preprocessResult,
              batch.statesData,
              rawStride,
              useOptimizedKeyframeSearch,
            );
            if (searchResult) {
              const interpOutput = await runKeyframeInterpPass(
                device,
                queue,
                preprocessResult.packedKeyframesBuffer,
                searchResult.searchResultsBuffer,
                searchResult.outputIndicesData,
                searchResult.entryCount,
                batch.entityCount,
                rawStride,
                archetypeId,
              );
              if (interpOutput) {
                outputBuffer = interpOutput;
              }
            }
          }
        }

        if (!outputBuffer) {
          const result = await dispatchGPUBatch(
            device,
            queue,
            batch,
            timingHelper,
            archetypeId,
            rawStride,
          );
          outputBuffer = result.outputBuffer;
          entityCount = result.entityCount;
        }

        if (viewportCullingEnabled && outputBuffer && entityCount > 0) {
          const cullRes = await runViewportCullingCompactionPass(
            device,
            queue,
            world,
            processor,
            archetypeId,
            batch,
            outputBuffer,
            rawStride,
          );
          if (cullRes.outputBuffer !== outputBuffer) {
            outputBuffer.destroy();
            outputBuffer = cullRes.outputBuffer;
          }
          entityCount = cullRes.entityCount;
          entityIdsForReadback = cullRes.entityIds;
          leaseId = cullRes.leaseId;
        }

        if (!outputBuffer || entityCount <= 0) {
          if (outputBuffer) outputBuffer.destroy();
          if (typeof leaseId === 'number') {
            processor.releaseEntityIds(leaseId);
          }
          continue;
        }

        const usedRawValueCount = entityCount * rawStride;
        const formattedBuffer = await runOutputFormatPass(
          device,
          queue,
          outputBuffer,
          usedRawValueCount,
          rawStride,
          outputChannels.length ? outputChannels : undefined,
        );

        const didFormat = formattedBuffer !== outputBuffer;
        const channelsForReadback = didFormat
          ? outputChannels.length
            ? outputChannels
            : undefined
          : rawChannels.length
            ? rawChannels
            : undefined;

        if (didFormat) {
          outputBuffer.destroy();
        }

        const stride = didFormat ? outputStride : rawStride;
        const bufferSize = (formattedBuffer as any).size as number | undefined;
        const expectedSize = entityCount * stride * 4;
        const byteSize = Math.min(bufferSize ?? expectedSize, expectedSize);

        const stagingBuffer = stagingPool.acquire(archetypeId, byteSize);
        if (!stagingBuffer) {
          formattedBuffer.destroy();
          if (typeof leaseId === 'number') {
            processor.releaseEntityIds(leaseId);
          }
          continue;
        }
        if (typeof leaseId === 'number') {
          processor.markEntityIdsInFlight(leaseId);
        }
        stagingPool.markInFlight(stagingBuffer);

        const copyEncoder = device.createCommandEncoder({
          label: `copy-output-${archetypeId}`,
        });
        copyEncoder.copyBufferToBuffer(formattedBuffer, 0, stagingBuffer, 0, byteSize);
        queue.submit([copyEncoder.finish()]);
        formattedBuffer.destroy();

        if (readbackManager) {
          const mapPromise = stagingBuffer.mapAsync((GPUMapMode as any).READ);
          readbackManager.enqueueMapAsync(
            archetypeId,
            entityIdsForReadback,
            stagingBuffer,
            mapPromise,
            byteSize,
            200, // 200ms timeout
            stride,
            channelsForReadback,
            leaseId,
          );
          setPendingReadbackCount(readbackManager.getPendingCount());
        }
      } catch {
        if (typeof leaseId === 'number') {
          processor.releaseEntityIds(leaseId);
        }
        console.warn('[Motion][WebGPUComputeSystem] dispatchGPUBatch failed', {
          archetypeId,
          entityCount: batch.entityCount,
          rawStride,
        });
      }
    }

    stagingPool.nextFrame();

    // Advance persistent buffer manager frame (for cleanup)
    try {
      const persistentBufferManager = getPersistentGPUBufferManager();
      persistentBufferManager.nextFrame();
    } catch {
      // Not initialized yet, ignore
    }
  },
};
