import type { GPUModuleFacade } from './lazy-loader';
import type {
  ArchetypeBatchDescriptor,
  GPUBatchDescriptor,
  PhysicsBatchDescriptor,
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
  GPUResultPacket,
} from '@g-motion/protocol';
import type { ChannelMapping } from '../runtime/channels';
import type { GPUBatchWithPreprocessedKeyframes } from '../runtime/types';
import type { GPUMetricsProvider } from '../runtime/metrics';
import type { InitConfig, WebGPUInitResult } from '../runtime/init';
import type { PendingReadback } from '../runtime/async-readback';
import type { ProcessOutputBufferInput } from '../output-format/output-buffer-processing';
import type { WebGPUEngine } from '../runtime/engine';
import type { WebGPUFrameEncoder } from '../runtime/encoder';

export type { GPUModuleFacade };
export type {
  ArchetypeBatchDescriptor,
  ChannelMapping,
  GPUBatchDescriptor,
  GPUBatchWithPreprocessedKeyframes,
  GPUMetricsProvider,
  GPUResultPacket,
  InitConfig,
  PendingReadback,
  PhysicsBatchDescriptor,
  ProcessOutputBufferInput,
  RawKeyframeGenerationOptions,
  RawKeyframeValueEvaluator,
  WebGPUEngine,
  WebGPUFrameEncoder,
  WebGPUInitResult,
};
