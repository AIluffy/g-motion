import type { SystemContext } from '../../runtime/plugin';
import {
  isKeyframeEntryExpandOnGPUEnabled,
  isKeyframeSearchIndexedEnabled,
  isWebGPUBatchedSubmitEnabled,
  isWebGPUForceStatesUploadEnabled,
  isWebGPUIODebugEnabled,
  isWebGPUStatesConditionalUploadEnabled,
  isWebGPUViewportCullingAsyncEnabled,
  isWebGPUViewportCullingEnabled,
  resolveKeyframeSearchIndexedMinKeyframes,
  resolveKeyframeSearchOptimizedFlag,
  resolveWebGPUOutputBufferReuseEnabled,
  resolveWebGPUReadbackMode,
} from './system-config';

export interface GPUFrameContext {
  /** GPU 设备与队列引用 */
  readonly device: {
    /** GPU 设备实例 */
    readonly gpu: GPUDevice;
    /** 提交命令的队列 */
    readonly queue: GPUQueue;
  };
  /** WebGPU 计算所需的核心服务 */
  readonly services: {
    /** ECS 世界实例，可为空 */
    readonly world: SystemContext['services']['world'] | null;
    /** 批处理器，用于构建与回收批次资源 */
    readonly processor: NonNullable<SystemContext['services']['batchProcessor']>;
    /** 应用配置 */
    readonly config: NonNullable<SystemContext['services']['config']>;
    /** GPU 指标提供器 */
    readonly metricsProvider: NonNullable<SystemContext['services']['metrics']>;
  };
  /** 当前帧的处理开关与策略 */
  readonly flags: {
    /** 是否启用 WebGPU IO 调试输出 */
    readonly debugIOEnabled: boolean;
    /** 是否开启关键帧预处理 */
    readonly preprocessEnabled: boolean;
    /** 是否启用优化版关键帧搜索 */
    readonly useOptimizedKeyframeSearch: boolean;
    /** 是否启用索引化关键帧搜索 */
    readonly keyframeSearchIndexedEnabled: boolean;
    /** 索引搜索启用的最小关键帧阈值 */
    readonly keyframeSearchIndexedMinKeyframes: number;
    /** 是否在 GPU 上展开关键帧条目 */
    readonly keyframeEntryExpandOnGPUEnabled: boolean;
    /** 是否启用视口裁剪 */
    readonly viewportCullingEnabled: boolean;
    /** 视口裁剪是否异步执行 */
    readonly viewportCullingAsyncEnabled: boolean;
    /** 是否仅在状态变化时上传状态 */
    readonly statesConditionalUploadEnabled: boolean;
    /** 是否强制上传状态缓冲区 */
    readonly forceStatesUploadEnabled: boolean;
    /** 是否复用输出缓冲区 */
    readonly outputBufferReuseEnabled: boolean;
    /** 是否批量提交 GPU 命令缓冲区 */
    readonly batchedSubmitEnabled: boolean;
  };
  /** 物理计算与时间步进参数 */
  readonly physics: {
    /** 当前帧时间步长（毫秒） */
    readonly dtMs: number;
    /** 当前帧时间步长（秒） */
    readonly dtSec: number;
    /** 物理系统允许的最大速度 */
    readonly maxVelocity: number;
  };
}

type MutableGPUFrameContext = {
  device: {
    gpu: GPUDevice;
    queue: GPUQueue;
  };
  services: {
    world: SystemContext['services']['world'] | null;
    processor: NonNullable<SystemContext['services']['batchProcessor']>;
    config: NonNullable<SystemContext['services']['config']>;
    metricsProvider: NonNullable<SystemContext['services']['metrics']>;
  };
  flags: {
    debugIOEnabled: boolean;
    preprocessEnabled: boolean;
    useOptimizedKeyframeSearch: boolean;
    keyframeSearchIndexedEnabled: boolean;
    keyframeSearchIndexedMinKeyframes: number;
    keyframeEntryExpandOnGPUEnabled: boolean;
    viewportCullingEnabled: boolean;
    viewportCullingAsyncEnabled: boolean;
    statesConditionalUploadEnabled: boolean;
    forceStatesUploadEnabled: boolean;
    outputBufferReuseEnabled: boolean;
    batchedSubmitEnabled: boolean;
  };
  physics: {
    dtMs: number;
    dtSec: number;
    maxVelocity: number;
  };
};

const frameContext: MutableGPUFrameContext = {
  device: {
    gpu: null as unknown as GPUDevice,
    queue: null as unknown as GPUQueue,
  },
  services: {
    world: null,
    processor: null as unknown as NonNullable<SystemContext['services']['batchProcessor']>,
    config: null as unknown as NonNullable<SystemContext['services']['config']>,
    metricsProvider: null as unknown as NonNullable<SystemContext['services']['metrics']>,
  },
  flags: {
    debugIOEnabled: false,
    preprocessEnabled: false,
    useOptimizedKeyframeSearch: true,
    keyframeSearchIndexedEnabled: false,
    keyframeSearchIndexedMinKeyframes: 64,
    keyframeEntryExpandOnGPUEnabled: true,
    viewportCullingEnabled: false,
    viewportCullingAsyncEnabled: true,
    statesConditionalUploadEnabled: false,
    forceStatesUploadEnabled: false,
    outputBufferReuseEnabled: false,
    batchedSubmitEnabled: false,
  },
  physics: {
    dtMs: 0,
    dtSec: 0,
    maxVelocity: 0,
  },
};

export function createGPUFrameContext(params: {
  world: SystemContext['services']['world'] | null;
  processor: NonNullable<SystemContext['services']['batchProcessor']>;
  config: NonNullable<SystemContext['services']['config']>;
  device: GPUDevice;
  metricsProvider: NonNullable<SystemContext['services']['metrics']>;
  dtMsInput: number;
  sampling?: SystemContext['sampling'];
}): GPUFrameContext {
  const { world, processor, config, device, metricsProvider, dtMsInput, sampling } = params;

  const debugIOEnabled = isWebGPUIODebugEnabled(config);
  const preprocessEnabled = !!config.keyframe?.preprocess?.enabled;
  const useOptimizedKeyframeSearch = resolveKeyframeSearchOptimizedFlag(config);
  const keyframeSearchIndexedEnabled = isKeyframeSearchIndexedEnabled(config);
  const keyframeSearchIndexedMinKeyframes = resolveKeyframeSearchIndexedMinKeyframes(config);
  const keyframeEntryExpandOnGPUEnabled = isKeyframeEntryExpandOnGPUEnabled(config);
  const readbackMode = resolveWebGPUReadbackMode(config);
  const viewportCullingEnabled =
    !!world && (isWebGPUViewportCullingEnabled(config) || readbackMode === 'visible');
  const viewportCullingAsyncEnabled =
    viewportCullingEnabled && isWebGPUViewportCullingAsyncEnabled(config);
  const statesConditionalUploadEnabled = isWebGPUStatesConditionalUploadEnabled(config);
  const forceStatesUploadEnabled = isWebGPUForceStatesUploadEnabled(config);
  const outputBufferReuseEnabled = resolveWebGPUOutputBufferReuseEnabled(config);
  const batchedSubmitEnabled = isWebGPUBatchedSubmitEnabled(config);

  const globalSpeed = config.globalSpeed ?? 1;
  const samplingMode = config.samplingMode ?? 'time';
  const baseDtMs =
    samplingMode === 'frame' && typeof sampling?.deltaTimeMs === 'number'
      ? sampling.deltaTimeMs
      : dtMsInput;
  const dtMs = baseDtMs * globalSpeed;
  const dtSec = dtMs / 1000;
  const maxVelocity = config.physicsMaxVelocity ?? 10000;

  frameContext.device.gpu = device;
  frameContext.device.queue = device.queue;
  frameContext.services.world = world;
  frameContext.services.processor = processor;
  frameContext.services.config = config;
  frameContext.services.metricsProvider = metricsProvider;
  frameContext.flags.debugIOEnabled = debugIOEnabled;
  frameContext.flags.preprocessEnabled = preprocessEnabled;
  frameContext.flags.useOptimizedKeyframeSearch = useOptimizedKeyframeSearch;
  frameContext.flags.keyframeSearchIndexedEnabled = keyframeSearchIndexedEnabled;
  frameContext.flags.keyframeSearchIndexedMinKeyframes = keyframeSearchIndexedMinKeyframes;
  frameContext.flags.keyframeEntryExpandOnGPUEnabled = keyframeEntryExpandOnGPUEnabled;
  frameContext.flags.viewportCullingEnabled = viewportCullingEnabled;
  frameContext.flags.viewportCullingAsyncEnabled = viewportCullingAsyncEnabled;
  frameContext.flags.statesConditionalUploadEnabled = statesConditionalUploadEnabled;
  frameContext.flags.forceStatesUploadEnabled = forceStatesUploadEnabled;
  frameContext.flags.outputBufferReuseEnabled = outputBufferReuseEnabled;
  frameContext.flags.batchedSubmitEnabled = batchedSubmitEnabled;
  frameContext.physics.dtMs = dtMs;
  frameContext.physics.dtSec = dtSec;
  frameContext.physics.maxVelocity = maxVelocity;

  return frameContext;
}
